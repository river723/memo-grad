/**
 * 管理员操作审计日志。
 *
 * 设计目标：
 * - **所有 admin 写操作必走 writeAuditLog**——这是单一入口，绕过它就是绕过审计。
 * - **写入失败不抛错**（best-effort）：业务事务已提交，审计只是事后复盘用，
 *   它的失败不应该把"封禁成功"变成"封禁 500"。失败时用 request.log.error
 *   留痕，运维通过日志告警发现。
 * - **必填字段强校验**：action/targetType/targetId 缺一不可，避免出现"不知道为什么
 *   写了一行"的脏数据。
 * - **targetType='user' 时 targetUserId 必填**：让 audit_log 反查 User 表有索引。
 */

import type { FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ApiError } from '../errors';

export type AuditTargetType = 'user' | 'order' | 'subscription' | 'announcement';

/**
 * 已知 action 命名规范：
 *   user.ban            — 封禁
 *   user.unban          — 解封
 *   user.set_role       — 改角色
 *   user.reset_password — 重置密码
 *   user.force_logout   — 强制下线
 *   user.reset_ai_quota — 重置 AI 配额
 *   sub.grant           — 授权订阅
 *   sub.revoke          — 撤销订阅
 *   sub.refund          — 退款
 *   announcement.create — 创建公告
 *   announcement.delete — 删除公告
 */
export type AuditAction =
  | 'user.ban'
  | 'user.unban'
  | 'user.set_role'
  | 'user.reset_password'
  | 'user.force_logout'
  | 'user.reset_ai_quota'
  | 'sub.grant'
  | 'sub.revoke'
  | 'sub.refund'
  | 'announcement.create'
  | 'announcement.delete';

export interface AuditWriteParams {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  /** 管理员在 confirm 弹窗里输入的备注（封禁原因/退款原因）。 */
  note?: string;
}

/**
 * 写一条审计日志。失败只 log，不抛错——见文件头注释的 trade-off 说明。
 *
 * 调用方应先完成业务事务（已经 commit），再调本函数。
 * 若想事务内同步落库，请改用 auditLog.writeAuditLogInTx，见下。
 */
export async function writeAuditLog(
  request: FastifyRequest | undefined,
  adminUserId: string,
  params: AuditWriteParams
): Promise<void> {
  if (!params.action || !params.targetType || !params.targetId) {
    // 必填字段缺失是调用方 bug，必须显式抛出以发现它，而不是悄悄写脏数据
    throw new Error('writeAuditLog: action/targetType/targetId 必填');
  }

  const ipAddress = request?.ip ?? null;
  const userAgent = (request?.headers['user-agent'] as string) ?? null;
  // targetType='user' 时冗余存 targetUserId，建索引让"某个用户的所有被操作记录"查询走索引
  const targetUserId = params.targetType === 'user' ? params.targetId : null;

  try {
    await prisma.adminActionLog.create({
      data: {
        adminUserId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetUserId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
        note: params.note || undefined,
      },
    });
  } catch (err) {
    // best-effort：审计写失败不抛错。request 可能为 undefined（CLI 脚本调用场景）
    if (request?.log) {
      request.log.error({ err, action: params.action, targetId: params.targetId }, 'writeAuditLog 失败');
    } else {
      // eslint-disable-next-line no-console
      console.error('writeAuditLog 失败', { action: params.action, targetId: params.targetId, err });
    }
  }
}

/**
 * 当调用方已经在 Prisma 事务里、想保证审计与业务同时落库时使用。
 * 与 writeAuditLog 的区别：失败抛错让事务回滚。
 */
export async function writeAuditLogInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  adminUserId: string,
  params: AuditWriteParams & { request?: FastifyRequest }
): Promise<void> {
  const ipAddress = params.request?.ip ?? null;
  const userAgent = (params.request?.headers['user-agent'] as string) ?? null;
  const targetUserId = params.targetType === 'user' ? params.targetId : null;

  await tx.adminActionLog.create({
    data: {
      adminUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetUserId,
      before: params.before ?? undefined,
      after: params.after ?? undefined,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
      note: params.note || undefined,
    },
  });
}

/**
 * 把 ApiError 的 statusCode/code 重新抛出，避免被 catch-all 吞掉。
 * 供调用方在 catch (err) 里判断要不要 rethrow。
 */
export function isApiError(err: unknown): err is InstanceType<typeof ApiError> {
  return err instanceof ApiError;
}
