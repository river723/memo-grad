/**
 * 云同步服务：本地优先写入 + 后台异步上传。
 *
 * 同步周期：
 *   1. 收集所有标记 dirty 的本地实体
 *   2. POST /api/sync 推送变更 + 拉取远端更新
 *   3. 将远端变更合并入本地 AsyncStorage（LWW：服务端已处理冲突）
 *   4. 清除本地 dirty 标记
 *
 * 触发时机：
 *   - app 启动后 5s（首次）
 *   - 切到前台（useEffect 监听 AppState）
 *   - 每 5 分钟定时
 *   - 手动触发（下拉刷新）
 */

import StorageService from './StorageService';
import { api } from './ApiClient';

interface SyncResult {
  serverTime: string;
  results: Record<string, { saved: number; pulled: number }>;
  entities: Record<string, any[]>;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

/**
 * 取某 Storage key 的全部实体（含软删除的，同步需要它们来传播删除事实）。
 * 通过 StorageService 获取带用户前缀的 key，确保不同用户数据隔离。
 */
async function getRawEntities(storageKey: string): Promise<any[]> {
  const data = await (StorageService as any)._rawGetItem(storageKey);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/** 获取所有需要同步的实体 key（带用户前缀） */
function getSyncEntityKeys(): Record<string, string> {
  return (StorageService as any).syncEntityKeys();
}

/** 获取 lastSyncAt 的存储 key（带用户前缀） */
function getLastSyncKey(): string {
  return (StorageService as any).lastSyncKey();
}

/**
 * 执行一次全量同步。
 */
export async function syncAll(): Promise<SyncResult | null> {
  if (isSyncing) return null;
  isSyncing = true;

  try {
    const entityKeys = getSyncEntityKeys();
    const lastSyncKey = getLastSyncKey();

    // 1. 收集所有 dirty 实体
    const entities: Record<string, any[]> = {};
    let hasDirty = false;

    for (const [entityName, storageKey] of Object.entries(entityKeys)) {
      const all = await getRawEntities(storageKey);
      const dirty = all.filter((e: any) => e.dirty);
      if (dirty.length > 0) {
        entities[entityName] = dirty;
        hasDirty = true;
      }
    }

    // 2. 读 lastSyncAt 游标
    let lastSyncAt = await (StorageService as any)._rawGetItem(lastSyncKey);

    // 一次性存量修复：旧版本游标用 serverTime，与改后的 @updatedAt（服务器落库时间）
    // 时间基不一致，直接失效重拉一次，让各端补回之前被增量过滤漏掉的记录。
    // 用 cursorVersion 哨兵保证只触发一次。
    const cursorVersionKey = (StorageService as any).key('kaoyan_sync_cursor_version');
    const cursorVersion = await (StorageService as any)._rawGetItem(cursorVersionKey);
    if (cursorVersion !== '2') {
      lastSyncAt = null; // 强制全量重拉
      await (StorageService as any)._rawSetItem(cursorVersionKey, '2');
      console.log('[Sync] 游标版本升级，触发一次性全量重拉');
    }

    // 即使没有 dirty 实体，也要拉取远端变更
    if (!hasDirty && !lastSyncAt) {
      // 首次同步且无本地数据：只拉取
      console.log('[Sync] 首次同步，拉取云端数据');
    }

    // 3. 推送到服务端
    const result = await api.post<SyncResult>('/api/sync', {
      lastSyncAt: lastSyncAt || null,
      entities: hasDirty ? entities : {},
    });

    const serverEntities = result.entities;

    // 4. 合并远端实体到本地
    for (const [entityName, remoteList] of Object.entries(serverEntities)) {
      const storageKey = entityKeys[entityName];
      if (!storageKey) continue;

      if (remoteList.length === 0) continue;

      const locals = await getRawEntities(storageKey);
      const localById = new Map<string, number>();
      locals.forEach((e: any, i: number) => { if (e.id) localById.set(e.id, i); });

      for (const remote of remoteList) {
        const existingIdx = localById.get(remote.id);
        if (existingIdx !== undefined) {
          // LWW：远端更新覆盖本地（服务器已处理冲突）
          if (!locals[existingIdx].updated_at || new Date(remote.updated_at) >= new Date(locals[existingIdx].updated_at)) {
            locals[existingIdx] = { ...remote, dirty: false };
          }
        } else {
          // 新记录
          locals.push({ ...remote, dirty: false });
        }
      }

      await (StorageService as any)._rawSetItem(storageKey, JSON.stringify(locals));
    }

    // 5. 清除本地 dirty 标记（推过的记录已 clean）
    for (const [entityName, storageKey] of Object.entries(entityKeys)) {
      const all = await getRawEntities(storageKey);
      let changed = false;
      const cleaned = all.map((e: any) => {
        if (e.dirty) {
          changed = true;
          return { ...e, dirty: false };
        }
        return e;
      });
      if (changed) {
        await (StorageService as any)._rawSetItem(storageKey, JSON.stringify(cleaned));
      }
    }

    // 6. 更新 lastSyncAt：用本次拉到的最晚记录时间作为新游标。
    //    不能用服务器当前时间（result.serverTime），否则空拉取（服务端尚无数据）
    //    会把游标直接推到"现在"，导致其他设备在此时间之前写入的记录
    //    （离线备份恢复等场景）永远被增量过滤器漏掉。
    let newCursor = lastSyncAt; // 默认保留旧游标（空拉取时不推进）
    for (const remoteList of Object.values(serverEntities)) {
      for (const r of remoteList) {
        if (r.updated_at && (!newCursor || r.updated_at > newCursor)) {
          newCursor = r.updated_at;
        }
      }
    }
    await (StorageService as any)._rawSetItem(lastSyncKey, newCursor);

    console.log('[Sync] 完成', result.results);
    return result;
  } catch (err: any) {
    // 同步失败不抛异常：离线时正常使用，下次联网自动重试
    console.warn('[Sync] 失败:', err?.message || err);
    return null;
  } finally {
    isSyncing = false;
  }
}

/**
 * 启动后台定时同步。
 * 在 AuthProvider 初始化后调用。
 */
export function startBackgroundSync(intervalMs: number = 5 * 60 * 1000) {
  if (syncTimer) return;
  // 首次 5 秒后同步
  setTimeout(() => syncAll(), 5000);
  // 每 N 分钟同步一次
  syncTimer = setInterval(() => syncAll(), intervalMs);
}

/**
 * 停止后台同步（登出时调用）。
 */
export function stopBackgroundSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

/**
 * 处理 app 切到前台的同步（React Native AppState）。
 */
export function onAppForeground() {
  syncAll();
}
