/**
 * 文章阅读计数端点：把 readCount 从 sync 实体里拆出来，改服务端原子自增。
 *
 * 背景：articles 走 /api/sync 泛型同步，push 是无条件覆盖。
 * ArticleDetailScreen 每次进详情都 read_count+1 并标 dirty，多端共用同一账号时
 * 各自 +1、各自推、后推者覆盖先推者——readCount 只累计"幸存的那几次推送"。
 * 走 convergeWordProgress 式的单调守卫也救不了：两台设备都从 5 算出 6，
 * 推上去还是 6，不是 7，计数器照样丢。所以必须服务端原子自增，不经 sync。
 *
 * 配套改动：syncRoutes.ts 对 article 实体剥掉 readCount / lastReadAt，
 * 避免客户端本地降级值回传覆盖服务端权威值。
 *
 * 副作用：文章实体的其他字段（title/content/word_ids/...）仍走 /api/sync，
 * 只是 read_count / last_read_at 这两个计数型字段不再由客户端写。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';

export default async function articleRoutes(app: FastifyInstance) {
  // 需登录：复用全局 authGuard（它会显式 jwtVerify 并校验 token type / 账号状态）。
  app.addHook('preHandler', app.authGuard);

  app.post<{ Params: { articleId: string } }>('/:articleId/read', async (request: FastifyRequest<{ Params: { articleId: string } }>) => {
    const userId = request.userId!;
    const { articleId } = request.params;

    const existing = await prisma.article.findFirst({
      where: { id: articleId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      // 文章不存在 / 不属于当前用户 / 已软删。客户端走本地 fallback，
      // 不重试也没关系——阅读数少 1 不影响功能。
      throw ApiError.notFound('ARTICLE_NOT_FOUND', `文章不存在：${articleId}`);
    }

    // 只增不减：服务端原子自增。lastReadAt 用服务器时间盖——避免客户端时钟基不一致。
    await prisma.article.update({
      where: { id: articleId },
      data: {
        readCount: { increment: 1 },
        lastReadAt: new Date(),
      },
    });

    // 回传新值让客户端立即显示，不必等下次 sync 拉取。
    const updated = await prisma.article.findFirst({
      where: { id: articleId },
      select: { readCount: true, lastReadAt: true },
    });

    return { ok: true, readCount: updated!.readCount, lastReadAt: updated!.lastReadAt };
  });
}
