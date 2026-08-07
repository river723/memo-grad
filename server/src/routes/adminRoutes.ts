/**
 * 管理员路由：提供对 admin 接口的访问入口。
 * 仅当用户已登录且具备管理员角色时，方可访问。
 *
 * 接口：
 *   GET    /api/admin/users        → 用户列表（分页+搜索）
 *   GET    /api/admin/users/:id    → 用户详情
 *   DELETE /api/admin/users/:id    → 软删除/封禁用户
 *   PATCH  /api/admin/users/:id    → 更新用户字段（role / disabled）
 *   GET    /api/admin/stats        → 全局统计概览
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiError } from '../errors';
import { prisma } from '../db';

export default async function adminRoutes(app: FastifyInstance) {
  // Step 1: JWT 认证 → request.userId
  // Step 2: role 校验 → 仅 admin 可通过
  app.addHook('preHandler', app.authGuard);
  app.addHook('preHandler', async (request: FastifyRequest) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: { role: true, disabled: true },
    });
    if (!user || user.disabled || user.role !== 'admin') {
      throw ApiError.forbidden('NOT_ADMIN', '仅管理员可访问此接口');
    }
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
  app.delete<{ Params: { id: string } }>('/users/:id', async (request, reply: FastifyReply) => {
    const { id } = request.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
    }
    await prisma.user.update({ where: { id }, data: { disabled: true } });
    // 撤销该用户的所有 refresh token，强制下线
    await prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { revokedAt: new Date() },
    });
    return { success: true, id };
  });

  // ---- PATCH /api/admin/users/:id ----
  app.patch<{ Params: { id: string }; Body: Partial<{ role: 'user' | 'admin'; disabled: boolean }> }>(
    '/users/:id',
    async (request) => {
      const { id } = request.params;
      const data = request.body;

      const allowed: { role?: 'user' | 'admin'; disabled?: boolean } = {};
      if (data.role !== undefined) {
        if (data.role === 'user' || data.role === 'admin') allowed.role = data.role;
        else throw ApiError.badRequest('INVALID_PARAMS', '角色只能是 user 或 admin');
      }
      if (data.disabled !== undefined) allowed.disabled = data.disabled;
      if (Object.keys(allowed).length === 0) {
        throw ApiError.badRequest('INVALID_PARAMS', '没有提供有效的更新字段');
      }

      const user = await prisma.user.update({ where: { id }, data: allowed });
      return user;
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
