/**
 * 系列故事公共 API。
 *
 * 设计要点：
 * - 公开端点（无需鉴权）—— 故事是全站共享内容。
 * - ETag 整剧级别：md5(storyId + max(updatedAt).iso)。任一章更新整剧 304 miss，
 *   客户端重拉全集。故事更新频率季度级，牺牲一点精度换实现简单。
 * - 列表端点不含 content/translation（只拉元信息），详情端点才拉全文。
 *
 * 端点列表：
 *   GET /api/stories                                 全量系列元信息 + 章节列表（不含正文）
 *   GET /api/stories/:storyId/chapters/:chapterId    单章完整内容
 *   GET /api/stories/:storyId/full                   全系列全部章节（带正文，预拉缓存用）
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../db';
import { ApiError } from '../errors';

const CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';

type FullParams = { storyId: string };
type ChapterParams = { storyId: string; chapterId: string };

function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.startsWith('W/')) return trimmed.slice(2).replace(/"/g, '');
  return trimmed.replace(/"/g, '');
}

/** 整剧级 ETag：md5(storyId + max(updatedAt).iso)。 */
function seriesEtag(storyId: string, updatedAt: Date): string {
  return crypto.createHash('md5').update(`${storyId}+${updatedAt.toISOString()}`).digest('hex');
}

/** 序列化章节元信息（列表端点用，不含正文）。 */
function serializeChapterMeta(row: {
  chapterId: number;
  title: string;
  wordCount: number;
  theme: string;
}) {
  return {
    chapterId: row.chapterId,
    title: row.title,
    wordCount: row.wordCount,
    theme: row.theme,
  };
}

/** 序列化章节全文（详情端点用）。 */
function serializeChapterFull(row: {
  chapterId: number;
  title: string;
  content: string;
  translation: string;
  words: unknown;
  wordCount: number;
  theme: string;
}) {
  return {
    id: row.chapterId,
    title: row.title,
    content: row.content,
    translation: row.translation,
    words: row.words,
    word_count: row.wordCount,
    theme: row.theme,
  };
}

async function loadSeriesOrThrow(storyId: string) {
  const series = await prisma.story.findUnique({ where: { id: storyId } });
  if (!series || series.deletedAt) {
    throw ApiError.notFound('STORY_NOT_FOUND', `未找到故事系列 ${storyId}`);
  }
  const latest = await prisma.storyChapter.findFirst({
    where: { storyId: series.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  return { series, latestUpdatedAt: latest?.updatedAt ?? series.updatedAt };
}

export default async function storyRoutes(app: FastifyInstance) {
  // ---------- 0. 系列列表（客户端发现 storyId 用） ----------
  app.get(
    '/stories',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => {
      const series = await prisma.story.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return {
        series: series.map((s) => ({
          id: s.id,
          seriesTitle: s.seriesTitle,
          totalChapters: s.totalChapters,
          totalWords: s.totalWords,
        })),
      };
    }
  );

  // ---------- 1. 系列元信息 + 章节列表 ----------
  app.get<{ Params: FullParams }>(
    '/stories/:storyId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: FullParams }>, reply: FastifyReply) => {
      const { series, latestUpdatedAt } = await loadSeriesOrThrow(request.params.storyId);
      const etag = seriesEtag(series.id, latestUpdatedAt);

      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === etag) {
        reply.header('etag', `"${etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }

      const chapters = await prisma.storyChapter.findMany({
        where: { storyId: series.id, deletedAt: null },
        orderBy: { chapterId: 'asc' },
      });

      reply.header('etag', `"${etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return {
        id: series.id,
        seriesTitle: series.seriesTitle,
        totalWords: series.totalWords,
        totalChapters: series.totalChapters,
        chapters: chapters.map(serializeChapterMeta),
      };
    }
  );

  // ---------- 2. 单章全文 ----------
  app.get<{ Params: ChapterParams }>(
    '/stories/:storyId/chapters/:chapterId',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: ChapterParams }>, reply: FastifyReply) => {
      const { series, latestUpdatedAt } = await loadSeriesOrThrow(request.params.storyId);
      const chapterNum = Number(request.params.chapterId);
      if (!Number.isInteger(chapterNum) || chapterNum < 1) {
        throw ApiError.badRequest('INVALID_CHAPTER', `章节号格式不正确: ${request.params.chapterId}`);
      }

      const chapter = await prisma.storyChapter.findUnique({
        where: { storyId_chapterId: { storyId: series.id, chapterId: chapterNum } },
      });
      if (!chapter || chapter.deletedAt) {
        throw ApiError.notFound('CHAPTER_NOT_FOUND', `未找到第 ${chapterNum} 章`);
      }

      const etag = seriesEtag(series.id, latestUpdatedAt);
      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === etag) {
        reply.header('etag', `"${etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }

      reply.header('etag', `"${etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return { chapter: serializeChapterFull(chapter) };
    }
  );

  // ---------- 3. 全系列全文（预拉缓存用） ----------
  app.get<{ Params: FullParams }>(
    '/stories/:storyId/full',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request: FastifyRequest<{ Params: FullParams }>, reply: FastifyReply) => {
      const { series, latestUpdatedAt } = await loadSeriesOrThrow(request.params.storyId);
      const etag = seriesEtag(series.id, latestUpdatedAt);

      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === etag) {
        reply.header('etag', `"${etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }

      const chapters = await prisma.storyChapter.findMany({
        where: { storyId: series.id, deletedAt: null },
        orderBy: { chapterId: 'asc' },
      });

      reply.header('etag', `"${etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return {
        series_title: series.seriesTitle,
        total_chapters: series.totalChapters,
        total_words: series.totalWords,
        chapters: chapters.map(serializeChapterFull),
      };
    }
  );
}
