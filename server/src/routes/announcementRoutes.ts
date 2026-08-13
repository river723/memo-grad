/**
 * 公开公告端点：客户端轮询当前生效的公告。
 *
 * 路径：/api/announcements/active（不带 admin 前缀）
 * 鉴权：可选 bearer —— 带了能区分 Pro / 非 Pro 受众；不带则按非 Pro 返回。
 * 限流：走全局限流（key=IP，未登录时）
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { listActiveAnnouncements } from '../services/announcementService';
import { getEntitlement } from '../services/subscriptionService';

export default async function announcementRoutes(app: FastifyInstance) {
  // 客户端轮询：GET /api/announcements/active
  // 可选鉴权：带 token 才能区分 Pro / 非 Pro
  app.get('/announcements/active', async (request: FastifyRequest) => {
    // 尝试解析 token（不强制）：让已登录用户能看到 audience='pro' 的公告
    let isPro = false;
    const auth = request.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        await request.jwtVerify();
        if (request.userId) {
          const ent = await getEntitlement(request.userId);
          isPro = ent.isPro;
        }
      } catch {
        // 忽略 token 错误，按非 Pro 处理
      }
    }

    const list = await listActiveAnnouncements('all', isPro);
    return { announcements: list };
  });

  // 健康检查用：仅返回数量（调试用，生产可删）
  app.get('/announcements/active/count', async () => {
    const now = new Date();
    const count = await prisma.announcement.count({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
    });
    return { count };
  });
}
