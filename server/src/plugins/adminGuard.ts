/**
 * 管理员认证守卫。
 *
 * 除了 authGuard 的正常 JWT 校验外，额外检查 role 字段。
 * 未授权的管理员操作返回 403 + FORBIDDEN_ADMIN，前端据此禁用管理入口。
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';

export default async function adminGuard(app: FastifyInstance) {
  app.addHook('preHandler', async function (request, reply) {
    // authGuard 先跑过（JWT 校验 + userId 注入）
    // 这里再查一次 role：access token 无状态，但 role 可能实时变更
    if (!request.userId) {
      // authGuard 应当已抛错，这里兜底
      throw ApiError.unauthorized('INVALID_TOKEN', '登录状态无效');
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { role: true, disabled: true },
    });

    if (!user || user.disabled) {
      throw ApiError.unauthorized('ACCOUNT_DISABLED', '账号已被停用');
    }

    if (user.role !== 'admin') {
      throw ApiError.forbidden('NOT_ADMIN', '仅管理员可访问此接口');
    }

    // 挂在 request 上让路由能拿到当前管理员信息
    (request as any).admin = user;
  });
}
