/**
 * 用户管理写操作服务。
 *
 * 把 adminRoutes 里的写入逻辑（封禁/改密/强制下线/重置配额）抽到这里，
 * 让路由层只做参数解析 + 调 service + 返回结果。
 *
 * 重要约定：
 * - **每个公开函数都做 LAST_ADMIN 守卫**（除 resetPassword / forceLogout / resetAiQuota，
 *   这三个不改变 role，不会引发锁死）。
 * - **降级 admin → user** 必须撤销该用户全部 refresh token（修 P0 自锁）。
 * - **封禁** 必须撤销 refresh token（沿用 P0 行为）。
 * - **强制下线** 不改 disabled 标志，只撤 token（区别于封禁）。
 * - **所有写入必走 writeAuditLog**（best-effort，不影响业务事务提交）。
 */

import type { FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';
import { revokeAllUserTokens } from './tokenService';
import { writeAuditLog, type AuditAction } from './auditLog';
import { hashPassword } from './passwordService';
import { startOfMonth } from '../utils/dateUtils';

// ==================== LAST_ADMIN 守卫 ====================

/**
 * 防止"封禁/降级最后一名管理员"导致全系统无法管理。
 *
 * 调用场景：
 *   1) DELETE /users/:id（封禁）
 *   2) PATCH /users/:id { role: 'user' }（降级）
 *   3) PATCH /users/:id { disabled: true }（封禁）
 *
 * 不需要守卫的操作：resetPassword / forceLogout / resetAiQuota —— 它们不改 role。
 */
async function assertNotLastAdmin(targetUserId: string, newRole?: 'user' | 'admin', newDisabled?: boolean): Promise<void> {
  if (newRole === 'user' || (newDisabled === true)) {
    // 检查目标用户当前是不是 admin（要降级或封禁的）
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (target?.role !== 'admin') return;

    // 是 admin，且新 role 是 user 或要封禁 → 数一下全局 admin 数量
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      throw ApiError.forbidden(
        'LAST_ADMIN',
        '系统至少需要保留一名管理员'
      );
    }
  }
}

// ==================== setDisabled（封禁/解封） ====================

export interface SetDisabledParams {
  /** true=封禁，false=解封 */
  disabled: boolean;
  /** 封禁原因（解封时忽略） */
  reason?: string;
}

export async function setDisabled(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string,
  params: SetDisabledParams
): Promise<{ revokedTokens: number; alreadyInState: boolean }> {
  await assertNotLastAdmin(userId, undefined, params.disabled);

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabled: true, disabledAt: true, disabledReason: true, role: true },
  });
  if (!before) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }
  if (before.disabled === params.disabled) {
    return { revokedTokens: 0, alreadyInState: true };
  }

  const updateData: Record<string, unknown> = { disabled: params.disabled };
  if (params.disabled) {
    updateData.disabledAt = new Date();
    updateData.disabledReason = params.reason ?? '管理员封禁';
    updateData.disabledById = adminId;
  } else {
    updateData.disabledAt = null;
    updateData.disabledReason = null;
    updateData.disabledById = null;
  }

  const after = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, disabled: true, disabledAt: true, disabledReason: true },
  });

  // 封禁才撤销；解封不撤销（用户需要重新登录才能恢复会话）
  const revokedTokens = params.disabled ? await revokeAllUserTokens(userId) : 0;

  const action: AuditAction = params.disabled ? 'user.ban' : 'user.unban';
  await writeAuditLog(request, adminId, {
    action,
    targetType: 'user',
    targetId: userId,
    before: {
      disabled: before.disabled,
      disabledAt: before.disabledAt?.toISOString() ?? null,
      disabledReason: before.disabledReason,
    },
    after: {
      disabled: after.disabled,
      disabledAt: after.disabledAt?.toISOString() ?? null,
      disabledReason: after.disabledReason,
    },
    note: params.disabled
      ? `${params.reason ?? '管理员封禁'}；撤销 ${revokedTokens} 个 refresh token`
      : '解封',
  });

  return { revokedTokens, alreadyInState: false };
}

// ==================== setRole（改角色） ====================

export async function setRole(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string,
  newRole: 'user' | 'admin'
): Promise<{ revokedTokens: number }> {
  await assertNotLastAdmin(userId, newRole, undefined);

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!before) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }
  if (before.role === newRole) {
    return { revokedTokens: 0 };
  }

  const after = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
    select: { id: true, role: true },
  });

  // 降级 admin → user 必须撤销该用户 token（修 P0 自锁）
  const demoting = before.role === 'admin' && newRole === 'user';
  const revokedTokens = demoting ? await revokeAllUserTokens(userId) : 0;

  await writeAuditLog(request, adminId, {
    action: 'user.set_role',
    targetType: 'user',
    targetId: userId,
    before: { role: before.role },
    after: { role: after.role },
    note: demoting ? `角色 ${before.role} → ${newRole}；撤销 ${revokedTokens} 个 refresh token` : `角色 ${before.role} → ${newRole}`,
  });

  return { revokedTokens };
}

// ==================== resetPassword（重置密码） ====================

export interface ResetPasswordParams {
  newPassword: string;
}

/**
 * 重置密码并撤销所有 refresh token。
 * 用户必须重新登录（旧的 access token 仍然有效到过期，但 refresh 不行，下一次刷新就 401）。
 */
export async function resetPassword(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string,
  params: ResetPasswordParams
): Promise<{ revokedTokens: number }> {
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, email: true },
  });
  if (!before) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }
  // 手机号登录用户没有 passwordHash，强行设一个会让用户能改用密码登录——这是新能力，写明在审计
  const wasSmsOnlyUser = !before.email;

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(params.newPassword) },
  });

  // 撤销该用户全部 token
  const revokedTokens = await revokeAllUserTokens(userId);

  await writeAuditLog(request, adminId, {
    action: 'user.reset_password',
    targetType: 'user',
    targetId: userId,
    before: { hadPassword: !wasSmsOnlyUser },
    after: { hadPassword: true },
    note: wasSmsOnlyUser
      ? `为短信登录用户设置密码；撤销 ${revokedTokens} 个 refresh token`
      : `重置密码；撤销 ${revokedTokens} 个 refresh token`,
  });

  return { revokedTokens };
}

// ==================== forceLogout（强制下线） ====================

/**
 * 强制下线：撤销该用户所有 refresh token，不改 disabled。
 * 当前 access token 仍有效到 expiresAt（默认 15min），用户下次刷新时才会被踢出。
 *
 * 文案要点（前端 ConfirmDialog）：「最迟 15 分钟后生效」。
 */
export async function forceLogout(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string
): Promise<{ revokedTokens: number }> {
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }

  const revokedTokens = await revokeAllUserTokens(userId);

  await writeAuditLog(request, adminId, {
    action: 'user.force_logout',
    targetType: 'user',
    targetId: userId,
    before: { activeTokens: 'unknown' },
    after: { activeTokens: 0 },
    note: `撤销 ${revokedTokens} 个 refresh token`,
  });

  return { revokedTokens };
}

// ==================== resetAiQuota（重置 AI 配额） ====================

/**
 * 删除本月 AiUsage 行。订阅不受影响（用户仍可继续用，只是配额重置）。
 * 注意：删除操作不影响月度限额，只是把"已用数"清零。
 */
export async function resetAiQuota(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string
): Promise<{ deletedRows: number }> {
  const monthStart = startOfMonth();
  const result = await prisma.aiUsage.deleteMany({
    where: { userId, createdAt: { gte: monthStart } },
  });

  await writeAuditLog(request, adminId, {
    action: 'user.reset_ai_quota',
    targetType: 'user',
    targetId: userId,
    before: { monthlyUsage: 'see before' },
    after: { monthlyUsage: 0 },
    note: `删除本月 ${result.count} 条 AiUsage 记录`,
  });

  return { deletedRows: result.count };
}
