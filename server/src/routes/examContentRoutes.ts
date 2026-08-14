/**
 * 真题内容公共 API。
 *
 * 设计要点：
 * - 公开端点（无需鉴权）—— 真题题面是全站共享内容。
 * - ETag 套卷级（year+setId）：md5(paperId + max(updatedAt).iso)。
 * - paperId / questionId 是历史错题的业务主键，序列化时原样透传，绝不重排。
 * - 限流：全量类端点 60/min，单题反查 600/min。
 *
 * 端点列表：
 *   GET /api/exams/years                             年份+套卷元信息
 *   GET /api/exams/:year/:setId                      整套卷（5 种类型）
 *   GET /api/exams/:year/:setId/reading              4 篇阅读
 *   GET /api/exams/:year/:setId/cloze                完形
 *   GET /api/exams/:year/:setId/newtype              新题型
 *   GET /api/exams/:year/:setId/translation          翻译
 *   GET /api/exams/:year/:setId/writing              写作
 *   GET /api/exams/questions/:questionId             单题反查（错题复习用）
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../db';
import { ApiError } from '../errors';

const CACHE_CONTROL = 'public, max-age=2592000, stale-while-revalidate=86400';

type YearParam = { year: string };
type YearSetParam = { year: string; setId: string };
type QuestionParam = { questionId: string };

function parseYear(raw: string): number {
  const n = Number(raw);
  // 1900-2100 是宽松的格式校验（"abc" 这类非数字才 400）；
  // 数据不存在（如 1999）由 loadFullPaper 的 findUnique 自然返回 404。
  if (!Number.isInteger(n) || n < 1900 || n > 2100) {
    throw ApiError.badRequest('INVALID_YEAR', `年份格式不正确: ${raw}`);
  }
  return n;
}

function parseSetId(raw: string): 'english1' | 'english2' {
  if (raw !== 'english1' && raw !== 'english2') {
    throw ApiError.badRequest('INVALID_SET', `套卷标识不正确: ${raw}（应为 english1 或 english2）`);
  }
  return raw;
}

function parseIfNoneMatch(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.startsWith('W/')) return trimmed.slice(2).replace(/"/g, '');
  return trimmed.replace(/"/g, '');
}

/** 序列化 reading passage 为前端消费形态。 */
function serializePassage(row: {
  paperId: string;
  title: string;
  passage: string;
  paragraphs: unknown;
  questions: unknown;
}) {
  return {
    id: row.paperId,
    title: row.title,
    passage: row.passage,
    paragraphs: row.paragraphs,
    questions: row.questions,
  };
}

/** 套卷级 ETag：md5(paperId + max(updatedAt).iso)。 */
function paperEtag(paperId: string, updatedAt: Date): string {
  return crypto.createHash('md5').update(`${paperId}+${updatedAt.toISOString()}`).digest('hex');
}

/** 加载 (year, setId) 套卷及其全部子内容。未找到抛 404。 */
async function loadFullPaper(year: number, setId: 'english1' | 'english2') {
  const paper = await prisma.realExamPaper.findUnique({
    where: { year_setId: { year, setId } },
  });
  if (!paper || paper.deletedAt) {
    throw ApiError.notFound('PAPER_NOT_FOUND', `未找到 ${year} 年 ${setId} 真题`);
  }
  const [passages, cloze, newType, translation, writing] = await Promise.all([
    prisma.realExamPassage.findMany({ where: { paperRefId: paper.id, deletedAt: null }, orderBy: { passageKey: 'asc' } }),
    prisma.realExamCloze.findUnique({ where: { paperRefId: paper.id } }),
    prisma.realExamNewType.findUnique({ where: { paperRefId: paper.id } }),
    prisma.realExamTranslation.findUnique({ where: { paperRefId: paper.id } }),
    prisma.realExamWriting.findUnique({ where: { paperRefId: paper.id } }),
  ]);
  return { paper, passages, cloze, newType, translation, writing };
}

export default async function examContentRoutes(app: FastifyInstance) {
  // ---------- 1. 年份列表 ----------
  app.get(
    '/exams/years',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => {
      const papers = await prisma.realExamPaper.findMany({
        where: { deletedAt: null },
        orderBy: { year: 'desc' },
      });
      const years: Array<{ year: number; english1: boolean; english2: boolean }> = [];
      const byYear = new Map<number, Set<string>>();
      for (const p of papers) {
        if (!byYear.has(p.year)) byYear.set(p.year, new Set());
        byYear.get(p.year)!.add(p.setId);
      }
      for (const [year, sets] of byYear) {
        years.push({ year, english1: sets.has('english1'), english2: sets.has('english2') });
      }
      return { years };
    }
  );

  // ---------- 2. 整套卷 ----------
  app.get<{ Params: YearSetParam }>(
    '/exams/:year/:setId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: YearSetParam }>, reply: FastifyReply) => {
      const year = parseYear(request.params.year);
      const setId = parseSetId(request.params.setId);
      const { paper, passages, cloze, newType, translation, writing } = await loadFullPaper(year, setId);

      const etag = paperEtag(`${year}-${setId}`, paper.updatedAt);
      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === etag) {
        reply.header('etag', `"${etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }

      reply.header('etag', `"${etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return {
        year,
        setId,
        etag,
        paperIds: paper.paperIds,
        reading: passages.map(serializePassage),
        cloze: cloze && !cloze.deletedAt
          ? { id: cloze.paperId, passage: cloze.passage, blanks: cloze.blanks, paragraphs: cloze.paragraphs }
          : null,
        newType: newType && !newType.deletedAt
          ? { id: newType.paperId, subtype: newType.subtype, direction: newType.direction, options: newType.options, questions: newType.questions }
          : null,
        translation: translation && !translation.deletedAt
          ? { id: translation.paperId, subtype: translation.subtype, direction: translation.direction, passage: translation.passage, items: translation.items }
          : null,
        writing: writing && !writing.deletedAt
          ? { id: writing.paperId, parts: writing.parts }
          : null,
      };
    }
  );

  // ---------- 3. 阅读 ----------
  app.get<{ Params: YearSetParam }>(
    '/exams/:year/:setId/reading',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: YearSetParam }>, reply: FastifyReply) => {
      const year = parseYear(request.params.year);
      const setId = parseSetId(request.params.setId);
      const { paper, passages } = await loadFullPaper(year, setId);
      const etag = paperEtag(`${year}-${setId}-reading`, paper.updatedAt);
      const ifNoneMatch = parseIfNoneMatch(request.headers['if-none-match']);
      if (ifNoneMatch && ifNoneMatch === etag) {
        reply.header('etag', `"${etag}"`);
        reply.header('cache-control', CACHE_CONTROL);
        return reply.status(304).send();
      }
      reply.header('etag', `"${etag}"`);
      reply.header('cache-control', CACHE_CONTROL);
      return { year, setId, reading: passages.map(serializePassage) };
    }
  );

  // ---------- 4. 完形 ----------
  app.get<{ Params: YearSetParam }>(
    '/exams/:year/:setId/cloze',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: YearSetParam }>) => {
      const year = parseYear(request.params.year);
      const setId = parseSetId(request.params.setId);
      const { cloze } = await loadFullPaper(year, setId);
      if (!cloze || cloze.deletedAt) {
        throw ApiError.notFound('CLOZE_NOT_FOUND', `未找到 ${year} 年 ${setId} 完形`);
      }
      return {
        id: cloze.paperId,
        passage: cloze.passage,
        blanks: cloze.blanks,
        paragraphs: cloze.paragraphs,
      };
    }
  );

  // ---------- 5. 新题型 ----------
  app.get<{ Params: YearSetParam }>(
    '/exams/:year/:setId/newtype',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: YearSetParam }>) => {
      const year = parseYear(request.params.year);
      const setId = parseSetId(request.params.setId);
      const { newType } = await loadFullPaper(year, setId);
      if (!newType || newType.deletedAt) {
        throw ApiError.notFound('NEWTYPE_NOT_FOUND', `未找到 ${year} 年 ${setId} 新题型`);
      }
      return {
        id: newType.paperId,
        subtype: newType.subtype,
        direction: newType.direction,
        options: newType.options,
        questions: newType.questions,
      };
    }
  );

  // ---------- 6. 翻译 ----------
  app.get<{ Params: YearSetParam }>(
    '/exams/:year/:setId/translation',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: YearSetParam }>) => {
      const year = parseYear(request.params.year);
      const setId = parseSetId(request.params.setId);
      const { translation } = await loadFullPaper(year, setId);
      if (!translation || translation.deletedAt) {
        throw ApiError.notFound('TRANSLATION_NOT_FOUND', `未找到 ${year} 年 ${setId} 翻译`);
      }
      return {
        id: translation.paperId,
        subtype: translation.subtype,
        direction: translation.direction,
        passage: translation.passage,
        items: translation.items,
      };
    }
  );

  // ---------- 7. 写作 ----------
  app.get<{ Params: YearSetParam }>(
    '/exams/:year/:setId/writing',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: YearSetParam }>) => {
      const year = parseYear(request.params.year);
      const setId = parseSetId(request.params.setId);
      const { writing } = await loadFullPaper(year, setId);
      if (!writing || writing.deletedAt) {
        throw ApiError.notFound('WRITING_NOT_FOUND', `未找到 ${year} 年 ${setId} 写作`);
      }
      return {
        id: writing.paperId,
        parts: writing.parts,
      };
    }
  );

  // ---------- 8. 单题反查（错题复习用） ----------
  // questionId 格式：{year}-e{1|2}-text{N}-q{M}（阅读题）
  // 完形/新题型/翻译的题不是 questionId 粒度，这里按 paperId 前缀匹配回整篇。
  app.get<{ Params: QuestionParam }>(
    '/exams/questions/:questionId',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: QuestionParam }>, reply: FastifyReply) => {
      const qid = decodeURIComponent(request.params.questionId);
      // 阅读单题：2023-e1-text1-q21 → paperId = 2023-e1-text1
      const m = /^(\d{4}-e[12]-text[1-4])-q(\d+)$/.exec(qid);
      if (!m) {
        throw ApiError.notFound('QUESTION_NOT_FOUND', `无法解析题目 ID: ${qid}`);
      }
      const paperId = m[1];
      const passage = await prisma.realExamPassage.findUnique({ where: { paperId } });
      if (!passage || passage.deletedAt) {
        throw ApiError.notFound('QUESTION_NOT_FOUND', `题目不存在或已被移除: ${qid}`);
      }
      const questions = passage.questions as Array<{ id: string }>;
      const question = questions.find((q) => q.id === qid);
      if (!question) {
        throw ApiError.notFound('QUESTION_NOT_FOUND', `题目不存在或已被移除: ${qid}`);
      }
      reply.header('cache-control', CACHE_CONTROL);
      return {
        question,
        paper: {
          id: passage.paperId,
          title: passage.title,
          passage: passage.passage,
          paragraphs: passage.paragraphs,
        },
      };
    }
  );
}
