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

/**
 * 复合主键的同步实体：Prisma delegate 的 model.fields 只暴露 name/typeName/isList/isEnum，
 * 拿不到 isId，无法反射出主键列，只能显式登记。
 *
 * 登记的值用**客户端 wire 字段名**（camelCase；snake 变体由 pickForPrisma 处理，
 * 不影响这里的行定位）。漏登一张复合主键表，会让整个 /api/sync 抛
 * PrismaClientValidationError（Unknown argument 'id'），响应体连同拉取结果一起丢失，
 * 所有设备从此互不可见。
 */
const COMPOSITE_KEY_FIELDS: Partial<Record<EntityName, string[]>> = {
  realExamWrongQuestion: ['questionId'],
};

/** 跨设备同词合并时产生的 id 重定向：废弃 id → 保留（canonical）id。 */
interface WordRedirect {
  from: string;
  to: string;
}

/**
 * 单条推送被服务端跳过的记录。
 *
 * 背景：备份导入 / 旧版本客户端会留下形状残缺的本地行（缺 study_mode、accuracy、
 * last_attempt_at 等 NOT NULL 列，或 Int 列是字符串）。这些行过不了 Prisma 校验，
 * 若直接抛出让整次 /api/sync 500，则**响应体连同所有实体的拉取结果一起丢失**：
 * 客户端永远拿不到"已推成功"的确认 → dirty 标记永不清除 → 同一批脏数据下次再推，
 * 形成永久 500 死循环（还连带把学习记录堆爆本地配额）。
 *
 * 改法：坏行按条跳过并记进 skipped 回传，其余行与拉取照常完成——先把用户解套，
 * 残留的坏行客户端能看到、能处理，而不是整条同步链路被一行卡死。
 */
interface SkippedRow {
  /** 该行在客户端的匹配键（主键列的值），供客户端定位并跳过清除 dirty */
  key: string;
  reason: string;
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

/**
 * 复习进度（review_stage / next_due_date）的单调收敛。
 * 复习阶段是"只应前进"的学习进度：离线设备可能带着旧的低阶段后推送，
 * 直接整行覆盖会把高进度打回去。规则：
 *   - 取更高的阶段，到期日跟随更高阶段一方；
 *   - 阶段相同则到期日取更早者（更保守，宁可多重温一次）；
 *   - 一方缺进度则保留另一方；都缺则不更新这两列。
 */
function convergeWordProgress(
  incomingStageRaw: unknown,
  incomingDueRaw: unknown,
  existing: { reviewStage?: unknown; nextDueDate?: unknown }
): { reviewStage?: number | null; nextDueDate?: string | null } {
  const incStage = typeof incomingStageRaw === 'number' ? incomingStageRaw : null;
  const incDue = typeof incomingDueRaw === 'string' ? incomingDueRaw : null;
  const exStage = typeof existing.reviewStage === 'number' ? existing.reviewStage : null;
  const exDue = typeof existing.nextDueDate === 'string' ? existing.nextDueDate : null;

  if (incStage === null) {
    return exStage === null ? {} : { reviewStage: exStage, nextDueDate: exDue };
  }
  if (exStage === null) {
    return { reviewStage: incStage, nextDueDate: incDue };
  }
  if (incStage > exStage) return { reviewStage: incStage, nextDueDate: incDue };
  if (incStage < exStage) return { reviewStage: exStage, nextDueDate: exDue ?? incDue };
  const due = incDue === null ? exDue : exDue === null ? incDue : (incDue <= exDue ? incDue : exDue);
  return { reviewStage: exStage, nextDueDate: due };
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

  /** 把客户端内容字段补进缺失位，并对复习进度做单调收敛；word/difficulty/frequency/deletedAt 保留现有值。 */
  const mergePatch = (dup: Record<string, unknown>): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const field of ['definitions', 'pronunciationUk', 'pronunciationUs', 'etymology', 'memoryTip', 'similarWords']) {
      if (isEmptyVal(dup[field]) && !isEmptyVal(data[field])) patch[field] = data[field];
    }
    // 进度字段不是"缺失补值"，而是取更先进的阶段（注意 0 也是合法阶段，不能走 isEmptyVal）
    const progress = convergeWordProgress(data.reviewStage, data.nextDueDate, dup);
    if (Object.prototype.hasOwnProperty.call(progress, 'reviewStage')) {
      patch.reviewStage = progress.reviewStage;
    }
    if (Object.prototype.hasOwnProperty.call(progress, 'nextDueDate')) {
      patch.nextDueDate = progress.nextDueDate;
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

/** 把 Prisma 错误翻译成给客户端看的简短原因；未知错误兜底为原 message。 */
function prismaErrorReason(err: any): string {
  if (err?.code === 'P2002') return '与服务端已有记录主键重复，已跳过';
  if (err?.code === 'P2003') return '关联的单词不存在，已跳过';
  if (err?.name === 'PrismaClientValidationError') return '字段缺失或类型不符，已跳过';
  return err?.message || '未知错误，已跳过';
}

/** 对特定实体表执行 upsert 和拉取 */
async function syncEntity(
  userId: string,
  tableName: EntityName,
  clientEntities: SyncEntity[],
  lastSyncAt: Date | null
): Promise<{ saved: number; pulled: number; entities: Record<string, any>[]; wordRedirects: WordRedirect[]; skipped: SkippedRow[] }> {
  const model = (prisma as any)[tableName];
  const wordRedirects: WordRedirect[] = [];
  const skipped: SkippedRow[] = [];

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

  // 主键列：单列主键表是 ['id']；复合主键表见 COMPOSITE_KEY_FIELDS。
  // 原实现统一 findUnique({ where: { id } })，对没有 id 列的复合主键表会直接抛
  // PrismaClientValidationError，整个 /api/sync 500，响应体连同拉取结果一起丢失。
  // 统一改走 findFirst({ where: { userId, ...主键列 } })：id 本身是主键，多加
  // userId 过滤不改变唯一性，语义与原 { id, userId } 完全等价。
  //
  // 注意用 isComposite 区分而非 keyFields.length：复合键的登记值只列非 userId 的列，
  // ['questionId'] 长度同样是 1，按长度判断会把复合表误判成单列主键。
  const isComposite = tableName in COMPOSITE_KEY_FIELDS;
  const keyFields = COMPOSITE_KEY_FIELDS[tableName] ?? ['id'];
  const keyWhere = (ent: SyncEntity): Record<string, unknown> => {
    const w: Record<string, unknown> = {};
    for (const f of keyFields) w[f] = (ent as Record<string, unknown>)[f];
    return w;
  };

  /**
   * update 的 where。单列主键的 { id } 已唯一；复合主键的 { questionId } 单独不唯一
   * （必须配 userId），而动态拼 Prisma 的复合唯一输入名（userId_questionId）易碎，
   * 故复合表走 updateMany——where 已含 userId + 主键列，恰好命中一行。
   */
  const updateExisting = async (ent: SyncEntity, data: Record<string, unknown>): Promise<void> => {
    if (!isComposite) {
      await model.update({ where: { id: ent.id }, data });
    } else {
      await model.updateMany({ where: { userId, ...keyWhere(ent) }, data });
    }
  };

  /** 落一条推送。任何 Prisma 失败都向上抛，由调用方按条捕获并跳过。 */
  const applyOneRow = async (ent: SyncEntity): Promise<void> => {
    const serverEnt = await model.findFirst({ where: { userId, ...keyWhere(ent) } });

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
      // 服务端有记录：客户端推即覆盖（@updatedAt 自动 bump updatedAt）。
      // 但复习进度单调收敛：离线旧设备回推低阶段不得把服务端高进度覆盖回去。
      if (tableName === 'word') {
        const progress = convergeWordProgress(data.reviewStage, data.nextDueDate, serverEnt);
        if (Object.prototype.hasOwnProperty.call(progress, 'reviewStage')) {
          data.reviewStage = progress.reviewStage;
        }
        if (Object.prototype.hasOwnProperty.call(progress, 'nextDueDate')) {
          data.nextDueDate = progress.nextDueDate;
        }
      }
      await updateExisting(ent, data);
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
      // createdAt 兜底：RealExamSession / RealExamWrongQuestion 该列 NOT NULL 且无 DB
      // 默认值，客户端漏传会让 create 直接 500。只补 create——update 不补，否则每次
      // 同步都会把创建时间刷成当前时间。
      //
      // 必须按字段存在性判断：StudyRecord / StudyPlan 根本没有 created_at 列，
      // 无脑塞 createdAt 会让 Prisma 抛 Unknown argument，整次 /api/sync 500。
      // 这是 c8fb06e 引入的回归——任何带 studyRecord/studyPlan 的同步全部挂掉。
      if (prismaFieldNames.includes('createdAt') && data.createdAt == null) {
        (data as Record<string, unknown>).createdAt = new Date();
      }
      await model.create({ data });
    }
  };

  // 1. 处理客户端推送的每条实体
  // updatedAt 字段标了 @updatedAt，由 Prisma 用服务器时间自动维护（create 用 now()，
  // update 自动 bump）。客户端传入的 updated_at 删除不用，否则 create 会落客户端本地时间，
  // 与 lastSyncAt 游标（也来自服务器时间）不同基，导致增量拉取漏数据。
  // push 不再做 LWW 比较：原 LWW 比较客户端本地时间，时钟不可靠（离线备份带旧时间戳），
  // 已造成漏数据；改由 @updatedAt 提供单调服务器时间基，冲突由拉取端 LWW 合并兜底。
  // 单条失败只跳过该行并记进 skipped，不中断整批——见 SkippedRow 的说明。
  let saved = 0;
  for (const ent of clientEntities) {
    // 回传键：主键列的值拼接。客户端按它定位跳过的行，不清除其 dirty。
    const rowKey = keyFields.map((f) => String((ent as Record<string, unknown>)[f])).join('/');
    try {
      await applyOneRow(ent);
      saved++;
    } catch (err: any) {
      skipped.push({ key: rowKey, reason: prismaErrorReason(err) });
    }
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
    skipped,
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

    const results: Record<string, { saved: number; pulled: number; entities: any[]; wordRedirects: WordRedirect[]; skipped: SkippedRow[] }> = {};
    const wordRedirects: WordRedirect[] = [];

    for (const entityName of ENTITIES) {
      const entities = (clientEntities[entityName] || []).map((e: any) => ({
        ...e,
        userId,
      }));
      let r: (typeof results)[string];
      try {
        r = await syncEntity(userId, entityName, entities, lastSyncAt);
      } catch (err: any) {
        // 整个实体挂掉（通常是末尾 findMany 出错）也不连坐：给该实体空结果，
        // 其余实体的推送与拉取照常返回，避免一次 /api/sync 全空。
        app.log.error({ err, entity: entityName }, '/api/sync 单实体失败，已隔离');
        r = {
          saved: 0,
          pulled: 0,
          entities: [],
          wordRedirects: [],
          skipped: [{ key: entityName, reason: prismaErrorReason(err) }],
        };
      }
      results[entityName] = r;
      if (r.wordRedirects.length) wordRedirects.push(...r.wordRedirects);
    }

    // 跨设备同词合并后，把指向被废弃 word id 的列字段外键统一迁移到 canonical id。
    // 必须在所有表 push 完之后：study_record / study_plan 可能在本次 sync 才刚推送
    // （word 表在 ENTITIES 中先于它们处理）。updateMany 自动 bump @updatedAt，
    // 迁移结果经下次增量 pull 下发各端。articles/exam_sessions/wrong_questions 的
    // JSON 内嵌 id 不在此迁移，由客户端收到重定向后改写并标 dirty 回传对齐。
    if (wordRedirects.length) {
      try {
        await prisma.$transaction(
          wordRedirects.flatMap(({ from, to }) => [
            prisma.studyRecord.updateMany({ where: { userId, wordId: from }, data: { wordId: to } }),
            prisma.studyPlan.updateMany({ where: { userId, wordId: from }, data: { wordId: to } }),
          ])
        );
      } catch (err: any) {
        // 迁移失败不致命：客户端收到重定向后本地已改写并会标 dirty 回传，
        // 下次同步服务端重跑这段即幂等补齐；不能让这里 500 丢掉全部拉取结果。
        app.log.error({ err }, '/api/sync word 外键迁移失败');
      }
    }

    const serverTime = new Date().toISOString();

    return {
      serverTime,
      wordRedirects,
      results: Object.fromEntries(
        Object.entries(results).map(([key, val]) => [key, { saved: val.saved, pulled: val.pulled, skipped: val.skipped }])
      ),
      entities: Object.fromEntries(
        Object.entries(results).map(([key, val]) => [key, val.entities])
      ),
    };
  });
}
