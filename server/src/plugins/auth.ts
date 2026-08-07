/**
 * 认证插件：注册 @fastify/jwt，并暴露 `authGuard` 供受保护路由使用。
 *
 * 用 fastify-plugin 包装以避免封装边界——否则装饰器只在子作用域可见，
 * 路由文件里拿不到 fastify.authGuard。
 */

import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { ApiError } from '../errors';
import { prisma } from '../db';

declare module 'fastify' {
  interface FastifyInstance {
    /** 校验 Bearer token，把 userId 挂到 request.userId。 */
    authGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.accessTtl },
  });

  app.decorate(
    'authGuard',
    async function authGuard(request: FastifyRequest, _reply: FastifyReply) {
      let payload: { sub?: string; typ?: string };
      try {
        payload = await request.jwtVerify();
      } catch {
        throw ApiError.unauthorized('INVALID_TOKEN', '登录状态无效，请重新登录');
      }

      // 拒绝拿 refresh token 当 access token 用：两者 TTL 差 2880 倍，
      // 混用等于把短时令牌的安全收益全部抹掉。
      if (payload.typ !== 'access') {
        throw ApiError.unauthorized('WRONG_TOKEN_TYPE', '令牌类型不正确');
      }
      if (!payload.sub) {
        throw ApiError.unauthorized('INVALID_TOKEN', '令牌缺少用户标识');
      }

      // 查一次库确认账号仍有效。这让封禁能立即生效，代价是每个受保护请求
      // 多一次主键查询——对 AI 代理这类本身要等上游数秒的接口完全可接受。
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, disabled: true },
      });
      if (!user) {
        throw ApiError.unauthorized('USER_NOT_FOUND', '用户不存在');
      }
      if (user.disabled) {
        throw ApiError.forbidden('ACCOUNT_DISABLED', '账号已被停用');
      }

      request.userId = user.id;
    }
  );
});
