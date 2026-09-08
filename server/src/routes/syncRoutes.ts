/**
 * 同步路由：客户端推送本地变更，拉取远端变更。
 *
 * 协议：
 *   POST /api/sync
 *   Body: { lastSyncAt: string | null, entities: { word: [...], studyRecord: [...], ... } }
 *   Response: { serverTime: string, entities: { word: [...], studyRecord: [...], ... } }
 *
 * 冲突策略：push 时不做 LWW（客户端推即覆盖），updatedAt 由 @updatedAt 用服务器
 * 时间自动维护，提供单调时间基；冲突由拉取端 LWW 合并兜底。学习类数据无协同编辑足够。
 * 软删除：deleted_at 非空的记录会传播到服务端，服务端在拉取时也会返回软删除的记录
 * （客户端看到 deleted_at 非空即执行本地软删除），从而完成"删除事实"的跨设备传播。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';

// 同步实体类型名（与 Prisma client delegate 名一致：prisma.word / prisma.studyRecord / ...
// 必须是单数，因为 syncEntity 通过 (prisma as any)[tableName] 反射拿模型 delegate。
// 复数名（如 'words'）会让 prisma 反射到 undefined，运行时抛 TypeError。）
const ENTITIES = [
  'word',
  'studyRecord',
  'studyPlan',
  'article',
  'examSession',
  'wrongQuestion',
  'realExamSession',
  'realExamWrongQuestion',
] as const;

type EntityName = typeof ENTITIES[number];

/** 跨设备同词合并时产生的 id 重定向：废弃 id → 保留（canonical）id。 */
interface WordRedirect {
  from: string;
  to: string;
}

/** 客户端推送实体时需要的字段 */
interface SyncEntity {
  id: string;
  userId: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean;
  word?: string;
  [key: string]: any;
}

/** 空值判断：null/undefined/空串/空数组/空对象都算"现有行缺失、可被补值"。 */
function isEmptyVal(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return true;
  return false;
}

/** 把 Prisma 模型的 camelCase 转回客户端的 snake_case */
function toSnakeCase(record: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    // direct mappings; we store userId → user_id etc but the client expects userId in snake_case
    const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

/**
 * word 推送去重：当推送的 id 在服务端不存在时，按 (userId, lower(word)) 查未软删的现有行。
 * 命中（跨设备同词、各自生成了不同 UUID）→ 把客户端带来的缺失字段补进现有行，**不新建**，
 * 并记录一条 id 重定向（from=客户端废弃 id，to=服务端保留 id）；未命中 → 正常 create。
 * 并发撞部分唯一索引（P2002，两端几乎同时提交）时重查再合并，等价 upsert。
 *
 * 注：update 即使 patch 为空也会因 @updatedAt 自动 bump updated_at，
 * 从而让保留行进入本次 pull 的增量结果，客户端据此拿到 canonical 行。
 */
async function dedupWordOnPush(
  model: any,
  userId: string,
  ent: SyncEntity,
  data: Record<string, unknown>,
  redirects: WordRedirect[]
): Promise<void> {
  const findDup = () =>
    model.findFirst({
      where: {
        userId,
        word: { equals: ent.word as string, mode: 'insensitive' },
        deletedAt: null,
      },
    });

  /** 仅把"现有行缺失而客户端有值"的内容字段补进去；word/difficulty/frequency/deletedAt 保留现有值。 */
  const mergePatch = (dup: Record<string, unknown>): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const field of ['definitions', 'pronunciationUk', 'pronunciationUs', 'etymology', 'memoryTip', 'similarWords']) {
      if (isEmptyVal(dup[field]) && !isEmptyVal(data[field])) patch[field] = data[field];
    }
    return patch;
  };

  let dup = await findDup();
  if (dup) {
    await model.update({ where: { id: dup.id }, data: mergePatch(dup) });
    redirects.push({ from: ent.id, to: dup.id });
    return;
  }

  try {
    await model.create({ data });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // 并发：另一设备几乎同时提交了同词行，撞 words_user_word_lower_unique
      dup = await findDup();
      if (dup) {
        await model.update({ where: { id: dup.id }, data: mergePatch(dup) });
        redirects.push({ from: ent.id, to: dup.id });
        return;
      }
    }
    throw err;
  }
}

/** 对特定实体表执行 upsert 和拉取 */
async function syncEntity(
  userId: string,
  tableName: EntityName,
  clientEntities: SyncEntity[],
  lastSyncAt: Date | null
): Promise<{ saved: number; pulled: number; entities: Record<string, any>[]; wordRedirects: WordRedirect[] }> {
  const model = (prisma as any)[tableName];
  const wordRedirects: WordRedirect[] = [];

  // 前端 SyncEntity 用 snake_case wire format（与 AsyncStorage 字面量对齐），
  // prisma client 用 camelCase 字段名。直接 `...ent` 会让 prisma 在严格模式下
  // 抛 "Unknown argument"，所以这里做一次 snake→camel 转换 + 字段白名单过滤。
  // pickForPrisma 用 model.fields 反射出 prisma 实际声明的字段名集合，
  // 避免每个 entity 硬编码一份白名单（8 张表会漏）。
  const prismaFieldNames = Object.keys(model.fields as Record<string, unknown>);
  const pickForPrisma = (raw: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const camel = k.includes('_') ? k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) : k;
      if (prismaFieldNames.includes(camel)) out[camel] = v;
    }
    return out;
  };

  // 1. 处理客户端推送的每条实体
  // updatedAt 字段标了 @updatedAt，由 Prisma 用服务器时间自动维护（create 用 now()，
  // update 自动 bump）。客户端传入的 updated_at 删除不用，否则 create 会落客户端本地时间，
  // 与 lastSyncAt 游标（也来自服务器时间）不同基，导致增量拉取漏数据。
  // push 不再做 LWW 比较：原 LWW 比较客户端本地时间，时钟不可靠（离线备份带旧时间戳），
  // 已造成漏数据；改由 @updatedAt 提供单调服务器时间基，冲突由拉取端 LWW 合并兜底。
  let saved = 0;
  for (const ent of clientEntities) {
    const serverEnt = await model.findUnique({
      where: { id: ent.id, userId },
    });

    // 兜底 prisma 必填 Json 字段。前端 SyncEntity 不带这些字段
    // （definitions 是 AI 分析后才有，初次同步的新词条一定是空），不补全会 500。
    const dataRaw: Record<string, unknown> = { ...ent, userId };
    if (tableName === 'word' && dataRaw.definitions == null) {
      dataRaw.definitions = [];
    }
    // deleted_at 软删除时间戳：deletedAt 不是 @updatedAt，仍需客户端传入
    if (ent.deleted_at) dataRaw.deletedAt = new Date(ent.deleted_at);
    const data = pickForPrisma(dataRaw);
    // 删 updatedAt：交给 @updatedAt 自动维护，保证 create 也用服务器时间
    delete (data as Record<string, unknown>).updatedAt;

    if (serverEnt) {
      // 服务端有记录：客户端推即覆盖（@updatedAt 自动 bump updatedAt）
      await model.update({ where: { id: ent.id }, data });
    } else if (
      tableName === 'word' &&
      typeof ent.word === 'string' &&
      ent.word.length > 0 &&
      !ent.deleted_at
    ) {
      // 跨设备同词去重：按 (userId, lower(word)) 命中现有词则合并进 canonical 行并记录重定向，
      // 否则新建。软删词不走此分支（软删行不参与唯一约束，直接 create 传播删除事实）。
      await dedupWordOnPush(model, userId, ent, data, wordRedirects);
    } else {
      await model.create({ data });
    }
    saved++;
  }

  // 2. 拉取服务端更新的记录（含软删除的，让客户端知道要删掉）
  const serverEntities = await model.findMany({
    where: {
      userId,
      updatedAt: lastSyncAt ? { gt: lastSyncAt } : undefined,
    },
    orderBy: { updatedAt: 'asc' },
  });

  return {
    saved,
    pulled: serverEntities.length,
    entities: serverEntities.map((r: any) => ({
      ...toSnakeCase(r),
      dirty: false, // 刚从服务端拉取，本地无需再推
    })),
    wordRedirects,
  };
}

export default async function syncRoutes(app: FastifyInstance) {
  // 所有端点需登录：复用全局 authGuard，它会显式调 request.jwtVerify()
  // 并校验 token type / 账号状态，单纯读 request.userId 是不会自动验签的。
  app.addHook('preHandler', app.authGuard);

  app.post('/', async (request: FastifyRequest) => {
    const userId = request.userId!;
    const body = request.body as {
      lastSyncAt?: string | null;
      entities?: Record<string, any[]>;
    };

    const clientEntities = body.entities || {};
    const lastSyncAt = body.lastSyncAt ? new Date(body.lastSyncAt) : null;

    const results: Record<string, { saved: number; pulled: number; entities: any[]; wordRedirects: WordRedirect[] }> = {};
    const wordRedirects: WordRedirect[] = [];

    for (const entityName of ENTITIES) {
      const entities = (clientEntities[entityName] || []).map((e: any) => ({
        ...e,
        userId,
      }));
      const r = await syncEntity(userId, entityName, entities, lastSyncAt);
      results[entityName] = r;
      if (r.wordRedirects.length) wordRedirects.push(...r.wordRedirects);
    }

    // 跨设备同词合并后，把指向被废弃 word id 的列字段外键统一迁移到 canonical id。
    // 必须在所有表 push 完之后：study_record / study_plan 可能在本次 sync 才刚推送
    // （word 表在 ENTITIES 中先于它们处理）。updateMany 自动 bump @updatedAt，
    // 迁移结果经下次增量 pull 下发各端。articles/exam_sessions/wrong_questions 的
    // JSON 内嵌 id 不在此迁移，由客户端收到重定向后改写并标 dirty 回传对齐。
    if (wordRedirects.length) {
      await prisma.$transaction(
        wordRedirects.flatMap(({ from, to }) => [
          prisma.studyRecord.updateMany({ where: { userId, wordId: from }, data: { wordId: to } }),
          prisma.studyPlan.updateMany({ where: { userId, wordId: from }, data: { wordId: to } }),
        ])
      );
    }

    const serverTime = new Date().toISOString();

    return {
      serverTime,
      wordRedirects,
      results: Object.fromEntries(
        Object.entries(results).map(([key, val]) => [key, { saved: val.saved, pulled: val.pulled }])
      ),
      entities: Object.fromEntries(
        Object.entries(results).map(([key, val]) => [key, val.entities])
      ),
    };
  });
}
