/**
 * 词库公共 API。
 *
 * 设计要点：
 * - 公开端点（无需鉴权）—— 词库是全站共享内容。
 * - ETag 协商：version.etag 已是稳定指纹，If-None-Match 命中直接 304。
 * - 限流按端点区分：/full（4.79 MB）10/h；单条查 600/min；元信息 60/min。
 * - 返回字段命名沿用前端 camelCase（suggestedDifficulty / examFrequency / memoryTip），
 *   由 seed_worddict.ts 写入时即保持，service 层不再做翻译。
 *
 * 端点列表：
 *   GET /api/worddict/meta                          拉当前版本元信息
 *   GET /api/worddict/full                          拉全量词条
 *   GET /api/worddict/words/:word                   拉单条
 *   GET /api/worddict/by-letter/:prefix             按首字母前缀（a-z）
 *   GET /api/worddict/versions/:version/words       拉指定历史版本全量
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';

const CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';

/** 从 If-None-Match 头解析单个 etag 字符串（去掉 W/ 弱标记和引号）。 */
function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  // Fastify 直接给的就是字符串，去掉弱标记前缀和引号
  const trimmed = header.trim();
  if (trimmed.startsWith('W/')) return trimmed.slice(2).replace(/"/g, '');
  return trimmed.replace(/"/g, '');
}

/** 序列化词条为前端消费形态。Prisma Json 字段返回的是 unknown，需规范化。 */
function serializeEntry(row: {
  word: string;
  definitions: unknown;
  etymology: string | null;
  similarWords: unknown;
  suggestedDifficulty: number | null;
  examFrequency: number | null;
  memoryTip: string | null;
}) {
  return {
    word: row.word,
    definitions: row.definitions,
    etymology: row.etymology ?? undefined,
    similar_words: row.similarWords ?? [],
    suggestedDifficulty: row.suggestedDifficulty ?? undefined,
    examFrequency: row.examFrequency ?? undefined,
    memoryTip: row.memoryTip ?? undefined,
  };
}

export default async function worddictRoutes(app: FastifyInstance) {
  // ---------- 1. 元信息 ----------
  app.get(
    '/worddict/meta',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const v = await prisma.wordDictVersion.findFirst({
        where: { isCurrent: true, deletedAt: null },
        orderBy: { publishedAt: 'desc' },
      });
      if (!v) {
        throw ApiError.notFound('WORDDICT_NOT_INITIALIZED', '词库尚未初始化');
      }

      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === v.etag) {
        reply.header('etag', `"${v.etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }

      reply.header('etag', `"${v.etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return {
        version: v.version,
        wordCount: v.wordCount,
        etag: v.etag,
        publishedAt: v.publishedAt.toISOString(),
      };
    }
  );

  // ---------- 2. 全量 ----------
  app.get(
    '/worddict/full',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const v = await prisma.wordDictVersion.findFirst({
        where: { isCurrent: true, deletedAt: null },
        orderBy: { publishedAt: 'desc' },
      });
      if (!v) {
        throw ApiError.notFound('WORDDICT_NOT_INITIALIZED', '词库尚未初始化');
      }

      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === v.etag) {
        reply.header('etag', `"${v.etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }

      const rows = await prisma.wordDictEntry.findMany({
        where: { versionId: v.id, deletedAt: null },
        orderBy: { word: 'asc' },
      });

      reply.header('etag', `"${v.etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return { version: v.version, etag: v.etag, entries: rows.map(serializeEntry) };
    }
  );

  // ---------- 3. 单条查 ----------
  app.get<{ Params: { word: string } }>(
    '/worddict/words/:word',
    {
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    },
    async (request) => {
      const raw = decodeURIComponent(request.params.word);
      const word = raw.trim().toLowerCase();
      if (!word) {
        throw ApiError.badRequest('INVALID_WORD', '单词不能为空');
      }
      const row = await prisma.wordDictEntry.findUnique({ where: { word } });
      if (!row || row.deletedAt) {
        throw ApiError.notFound('WORD_NOT_FOUND', `未找到单词 ${word}`);
      }
      return { entry: serializeEntry(row) };
    }
  );

  // ---------- 4. 按首字母前缀 ----------
  app.get<{ Params: { prefix: string } }>(
    '/worddict/by-letter/:prefix',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request) => {
      const raw = decodeURIComponent(request.params.prefix).toLowerCase();
      if (!/^[a-z]$/.test(raw)) {
        throw ApiError.badRequest('INVALID_PREFIX', '前缀必须是单个字母 a-z');
      }
      const v = await prisma.wordDictVersion.findFirst({
        where: { isCurrent: true, deletedAt: null },
        orderBy: { publishedAt: 'desc' },
      });
      if (!v) {
        throw ApiError.notFound('WORDDICT_NOT_INITIALIZED', '词库尚未初始化');
      }
      const rows = await prisma.wordDictEntry.findMany({
        where: {
          versionId: v.id,
          deletedAt: null,
          word: { startsWith: raw },
        },
        orderBy: { word: 'asc' },
      });
      return { prefix: raw, count: rows.length, entries: rows.map(serializeEntry) };
    }
  );

  // ---------- 5. 历史版本 ----------
  app.get<{ Params: { version: string } }>(
    '/worddict/versions/:version/words',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (request) => {
      const version = decodeURIComponent(request.params.version);
      const v = await prisma.wordDictVersion.findUnique({ where: { version } });
      if (!v || v.deletedAt) {
        throw ApiError.notFound('VERSION_NOT_FOUND', `未找到版本 ${version}`);
      }
      const rows = await prisma.wordDictEntry.findMany({
        where: { versionId: v.id, deletedAt: null },
        orderBy: { word: 'asc' },
      });
      return {
        version: v.version,
        etag: v.etag,
        publishedAt: v.publishedAt.toISOString(),
        entries: rows.map(serializeEntry),
      };
    }
  );
}
