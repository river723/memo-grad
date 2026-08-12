/**
 * 管理员路由：提供对 admin 接口的访问入口。
 * 仅当用户已登录且具备管理员角色时，方可访问。
 *
 * 接口（Phase A：基础 + 审计 + 降级撤销 refresh token）：
 *   GET    /api/admin/users        → 用户列表（分页+搜索）
 *   GET    /api/admin/users/:id    → 用户详情
 *   DELETE /api/admin/users/:id    → 软删除/封禁用户（带审计 + 强制下线）
 *   PATCH  /api/admin/users/:id    → 更新用户字段（role / disabled，带审计 + 撤销）
 *   GET    /api/admin/stats        → 全局统计概览
 *
 * Phase C 起会继续在这里加 reset-password / grant-subscription / refund 等端点。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiError } from '../errors';
import { prisma } from '../db';
import { revokeAllUserTokens } from '../services/tokenService';
import { writeAuditLog } from '../services/auditLog';

// 扩展 request 类型：admin 路由的 preHandler 会写入 adminId
declare module 'fastify' {
  interface FastifyRequest {
    /** 当前请求的 admin userId，由 adminRoutes 的 preHandler 写入。 */
    adminId?: string;
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  // Step 1: JWT 认证 → request.userId
  // Step 2: role 校验 → 仅 admin 可通过；通过后挂 request.adminId 供审计使用
  app.addHook('preHandler', app.authGuard);
  app.addHook('preHandler', async (request: FastifyRequest) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: { id: true, role: true, disabled: true },
    });
    if (!user || user.disabled || user.role !== 'admin') {
      throw ApiError.forbidden('NOT_ADMIN', '仅管理员可访问此接口');
    }
    request.adminId = user.id;
  });

  // ---- GET /api/admin/users ----
  app.get('/users', async (request: FastifyRequest) => {
    const page = Math.max(0, parseInt((request.query as Record<string, string>).page) || 0);
    const limit = Math.min(100, Math.max(1, parseInt((request.query as Record<string, string>).limit) || 20));
    const search = (request.query as Record<string, string>).search ?? '';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: search
          ? {
              OR: [
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
        skip: page * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          email: true,
          role: true,
          disabled: true,
          disabledAt: true,
          disabledReason: true,
          createdAt: true,
        },
      }),
      prisma.user.count({
        where: search
          ? {
              OR: [
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
      }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  // ---- GET /api/admin/users/:id ----
  app.get<{ Params: { id: string } }>('/users/:id', async (request) => {
    const { id } = request.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        disabled: true,
        disabledAt: true,
        disabledReason: true,
        disabledById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
    }
    return user;
  });

  // ---- DELETE /api/admin/users/:id ----
  app.delete<{ Params: { id: string } }>('/users/:id', async (request) => {
    const { id } = request.params;
    const adminId = request.adminId!;

    const before = await prisma.user.findUnique({
      where: { id },
      select: { id: true, disabled: true, disabledAt: true, disabledReason: true, role: true },
    });
    if (!before) {
      throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
    }
    if (before.disabled) {
      // 幂等：已封禁直接返回成功，不重复写审计
      return { success: true, id, alreadyDisabled: true };
    }

    // 防自锁：若目标是 admin，必须留至少一名 admin
    if (before.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw ApiError.forbidden(
          'LAST_ADMIN',
          '系统至少需要保留一名管理员，无法封禁/降级最后一名管理员'
        );
      }
    }

    const now = new Date();
    const after = await prisma.user.update({
      where: { id },
      data: {
        disabled: true,
        disabledAt: now,
        disabledReason: '管理员封禁',
        disabledById: adminId,
      },
      select: { id: true, disabled: true, disabledAt: true, disabledReason: true, role: true },
    });

    // 强制下线：撤销该用户所有 refresh token
    const revokedCount = await revokeAllUserTokens(id);

    // 审计
    await writeAuditLog(request, adminId, {
      action: 'user.ban',
      targetType: 'user',
      targetId: id,
      before: { disabled: before.disabled, disabledAt: before.disabledAt, disabledReason: before.disabledReason },
      after: { disabled: after.disabled, disabledAt: after.disabledAt?.toISOString() ?? null, disabledReason: after.disabledReason },
      note: `撤销 ${revokedCount} 个 refresh token`,
    });

    return { success: true, id, revokedTokens: revokedCount };
  });

  // ---- PATCH /api/admin/users/:id ----
  app.patch<{ Params: { id: string }; Body: Partial<{ role: 'user' | 'admin'; disabled: boolean }> }>(
    '/users/:id',
    async (request) => {
      const { id } = request.params;
      const data = request.body;
      const adminId = request.adminId!;

      // 仅 role / disabled 字段可写
      const allowed: { role?: 'user' | 'admin'; disabled?: boolean } = {};
      if (data.role !== undefined) {
        if (data.role === 'user' || data.role === 'admin') allowed.role = data.role;
        else throw ApiError.badRequest('INVALID_PARAMS', '角色只能是 user 或 admin');
      }
      if (data.disabled !== undefined) allowed.disabled = data.disabled;
      if (Object.keys(allowed).length === 0) {
        throw ApiError.badRequest('INVALID_PARAMS', '没有提供有效的更新字段');
      }

      const before = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, disabled: true, disabledAt: true, disabledReason: true },
      });
      if (!before) {
        throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
      }

      // LAST_ADMIN 守卫：demote admin（admin→user）或封禁 admin 前必须留至少一名
      const demotingAdmin = before.role === 'admin' && allowed.role === 'user';
      const disablingAdmin = !before.disabled && allowed.disabled === true && before.role === 'admin';
      if (demotingAdmin || disablingAdmin) {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
          throw ApiError.forbidden(
            'LAST_ADMIN',
            '系统至少需要保留一名管理员'
          );
        }
      }

      // 拼装 update payload：disabled 状态变化要同步 disabledAt / disabledReason / disabledById
      const updateData: Record<string, unknown> = { ...allowed };
      if (allowed.disabled === true && !before.disabled) {
        updateData.disabledAt = new Date();
        updateData.disabledReason = '管理员封禁';
        updateData.disabledById = adminId;
      } else if (allowed.disabled === false && before.disabled) {
        // 解封：清空元数据
        updateData.disabledAt = null;
        updateData.disabledReason = null;
        updateData.disabledById = null;
      }

      const after = await prisma.user.update({
        where: { id },
        data: updateData,
        select: { id: true, role: true, disabled: true, disabledAt: true, disabledReason: true, disabledById: true },
      });

      // 撤销 refresh token 的两个触发点：
      //  1. 角色从 admin 降为 user（即使目标不是当前 admin 自己也撤销）
      //  2. 状态从 enabled 变为 disabled
      // 重新启用不清——用户需要重新登录
      let revokedTokens: number | null = null;
      if (demotingAdmin || (allowed.disabled === true && !before.disabled)) {
        revokedTokens = await revokeAllUserTokens(id);
      }

      // 审计：根据变更类型选 action
      const noteParts: string[] = [];
      let action: 'user.unban' | 'user.set_role' | 'user.ban' | null = null;
      if (allowed.disabled !== undefined && allowed.disabled !== before.disabled) {
        action = allowed.disabled ? 'user.ban' : 'user.unban';
        noteParts.push(allowed.disabled ? '封禁' : '解封');
      }
      if (allowed.role !== undefined && allowed.role !== before.role) {
        action = action ?? 'user.set_role';
        noteParts.push(`角色 ${before.role} → ${allowed.role}`);
      }
      // 即使没有字段变化（例如重复 PATCH）也不写审计
      if (action) {
        await writeAuditLog(request, adminId, {
          action,
          targetType: 'user',
          targetId: id,
          before: {
            role: before.role,
            disabled: before.disabled,
            disabledAt: before.disabledAt?.toISOString() ?? null,
          },
          after: {
            role: after.role,
            disabled: after.disabled,
            disabledAt: after.disabledAt?.toISOString() ?? null,
          },
          note: revokedTokens != null ? `${noteParts.join('；')}；撤销 ${revokedTokens} 个 refresh token` : noteParts.join('；'),
        });
      }

      return after;
    }
  );

  // ---- GET /api/admin/stats ----
  app.get('/stats', async () => {
    const [
      totalUsers,
      activeSubscriptions,
      totalAiCalls,
      adminCount,
      disabledCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.aiUsage.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { disabled: true } }),
    ]);

    return {
      totalUsers,
      activeSubscriptions,
      totalAiCalls,
      adminCount,
      disabledCount,
      generatedAt: new Date().toISOString(),
    };
  });
}
