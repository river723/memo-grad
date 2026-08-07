/**
 * 同步路由：客户端推送本地变更，拉取远端变更。
 *
 * 协议：
 *   POST /api/sync
 *   Body: { lastSyncAt: string | null, entities: { words: [...], studyRecords: [...], ... } }
 *   Response: { serverTime: string, entities: { words: [...], studyRecords: [...], ... } }
 *
 * 冲突策略：last-write-wins（比较每条记录的 updated_at）。学习类数据无协同编辑，LWW 足够。
 * 软删除：deleted_at 非空的记录会传播到服务端，服务端在拉取时也会返回软删除的记录
 * （客户端看到 deleted_at 非空即执行本地软删除），从而完成"删除事实"的跨设备传播。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';

// 同步实体类型名（与前端 AsyncStorage key 对应）
const ENTITIES = [
  'words',
  'studyRecords',
  'studyPlans',
  'articles',
  'examSessions',
  'wrongQuestions',
  'realExamSessions',
  'realExamWrongQuestions',
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
  const model = (prisma as any)[tableName] as {
    findUnique: Function;
    upsert: Function;
    create: Function;
    findMany: Function;
    updateMany: Function;
  };

  // 1. 处理客户端推送的每条实体
  let saved = 0;
  for (const ent of clientEntities) {
    const serverEnt = await model.findUnique({
      where: { id: ent.id, userId },
    });

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
          // 按字段写入（安全：只传客户端有的字段，避免覆盖服务端独有的字段）
          await model.upsert({
            where: { id: ent.id },
            create: { ...ent, userId, updatedAt: new Date(ent.updated_at) },
            update: { ...ent, updatedAt: new Date(ent.updated_at) },
          });
        }
        saved++;
      }
    } else {
      // 服务端无记录：直接创建
      await model.create({
        data: {
          ...ent,
          userId,
          updatedAt: new Date(ent.updated_at),
          deletedAt: ent.deleted_at ? new Date(ent.deleted_at) : null,
        },
      });
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
  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (!request.userId) {
      throw ApiError.unauthorized('NOT_AUTHENTICATED', '请先登录');
    }
  });

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
