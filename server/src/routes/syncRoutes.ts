/**
 * 同步路由：客户端推送本地变更，拉取远端变更。
 *
 * 协议：
 *   POST /api/sync
 *   Body: { lastSyncAt: string | null, entities: { word: [...], studyRecord: [...], ... } }
 *   Response: { serverTime: string, entities: { word: [...], studyRecord: [...], ... } }
 *
 * 冲突策略：last-write-wins（比较每条记录的 updated_at）。学习类数据无协同编辑，LWW 足够。
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

/** 客户端推送实体时需要的字段 */
interface SyncEntity {
  id: string;
  userId: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean;
  [key: string]: any;
}

/** LWW：比较两条记录的 updated_at，返回较新的 */
function isNewer(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
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

/** 对特定实体表执行 upsert 和拉取 */
async function syncEntity(
  userId: string,
  tableName: EntityName,
  clientEntities: SyncEntity[],
  lastSyncAt: Date | null
): Promise<{ saved: number; pulled: number; entities: Record<string, any>[] }> {
  const model = (prisma as any)[tableName];

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
    // 时间字段显式转换：snake_case ISO 字符串 → camelCase Date
    if (ent.updated_at) dataRaw.updatedAt = new Date(ent.updated_at);
    if (ent.deleted_at) dataRaw.deletedAt = new Date(ent.deleted_at);
    const data = pickForPrisma(dataRaw);

    if (serverEnt) {
      // 服务端有记录：LWW
      if (isNewer(ent.updated_at, serverEnt.updatedAt?.toISOString() || '')) {
        // 客户端版本更新，覆盖服务端
        if (ent.deleted_at) {
          await model.update({
            where: { id: ent.id },
            data: { deletedAt: new Date(ent.deleted_at), updatedAt: new Date(ent.updated_at) },
          });
        } else {
          await model.upsert({
            where: { id: ent.id },
            create: data,
            update: data,
          });
        }
        saved++;
      }
    } else {
      // 服务端无记录：直接创建
      await model.create({ data });
      saved++;
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

    const results: Record<string, { saved: number; pulled: number; entities: any[] }> = {};

    for (const entityName of ENTITIES) {
      const entities = (clientEntities[entityName] || []).map((e: any) => ({
        ...e,
        userId,
      }));
      results[entityName] = await syncEntity(userId, entityName, entities, lastSyncAt);
    }

    const serverTime = new Date().toISOString();

    return {
      serverTime,
      results: Object.fromEntries(
        Object.entries(results).map(([key, val]) => [key, { saved: val.saved, pulled: val.pulled }])
      ),
      entities: Object.fromEntries(
        Object.entries(results).map(([key, val]) => [key, val.entities])
      ),
    };
  });
}
