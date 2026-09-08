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

interface WordRedirect {
  from: string;
  to: string;
}

interface SyncResult {
  serverTime: string;
  results: Record<string, { saved: number; pulled: number }>;
  entities: Record<string, any[]>;
  /** 跨设备同词合并产生的 id 重定向（废弃 id → canonical id），需在本地收敛。 */
  wordRedirects?: WordRedirect[];
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
    // v3：在全量重拉后追加一次「孤儿重复词」对账（见 reconcileOrphanWords），
    // 清理服务端同词去重上线后、旧版客户端窗口期残留在本地的重复词。
    const cursorVersionKey = (StorageService as any).key('kaoyan_sync_cursor_version');
    const cursorVersion = await (StorageService as any)._rawGetItem(cursorVersionKey);
    const fullReconcile = cursorVersion !== '3';
    if (fullReconcile) {
      lastSyncAt = null; // 强制全量重拉
      await (StorageService as any)._rawSetItem(cursorVersionKey, '3');
      console.log('[Sync] 游标版本升级 v3，触发一次性全量重拉 + 重复词对账');
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

    // 7. 应用服务端下发的 word id 重定向（跨设备同词合并后的本地收敛）
    if (Array.isArray(result.wordRedirects) && result.wordRedirects.length) {
      await applyWordRedirects(result.wordRedirects, entityKeys);
    }

    // 8. 一次性孤儿词对账（仅 cursorVersion 升级到 v3 的那次全量重拉触发）
    if (fullReconcile) {
      await reconcileOrphanWords(serverEntities, entityKeys);
    }

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
 * 应用服务端下发的 word id 重定向（跨设备同词合并后，废弃 id → canonical id）。
 *
 * 服务端是权威：它决定保留哪个 id，本函数只负责把本地数据对齐到该决定：
 * - words：**物理移除**废弃 id 的行。不能软删回传——服务端本就没有该行，
 *   软删上传会被当成新软删行 create 出来。废弃行的内容本次已合并进 canonical 行，不丢数据。
 * - study_records / study_plans：改写 word_id，**不标 dirty**——服务端已迁移并 bump，
 *   下次增量 pull 会用权威版本 LWW 覆盖，本地提前改好是为了当下查询/统计正确。
 * - articles / exam_sessions / wrong_questions：改写 JSON 内嵌的 word_id 并**标 dirty**，
 *   下次同步回传对齐服务端（服务端实时合并不解析这三类 JSON，靠客户端回传收敛）。
 *
 * 引用点与 src/services/migrations.ts 的 UUID 迁移保持一致：
 *   Article.word_ids[]、ExamSession.questions[].word_id、
 *   ExamSession.answers[].question.word_id、WrongQuestion.question.word_id。
 */
async function applyWordRedirects(
  redirects: WordRedirect[],
  entityKeys: Record<string, string>
): Promise<void> {
  const redirectMap = new Map(redirects.map(r => [r.from, r.to]));
  const mapId = (id: unknown): string => {
    if (typeof id !== 'string' || id === '') return typeof id === 'string' ? id : '';
    return redirectMap.get(id) ?? id;
  };
  /** 改写题目对象内嵌的 word_id；映射不到 / 非对象原样返回。 */
  const rewriteQuestion = (q: any): any =>
    q && typeof q === 'object' ? { ...q, word_id: mapId(q.word_id) } : q;

  const rawSet = async (key: string | undefined, value: any[]) => {
    if (key) await (StorageService as any)._rawSetItem(key, JSON.stringify(value));
  };

  try {
    // words：移除废弃 id 行
    const wordKey = entityKeys.word;
    if (wordKey) {
      const words = await getRawEntities(wordKey);
      const kept = words.filter((w: any) => !redirectMap.has(w.id));
      if (kept.length !== words.length) {
        await rawSet(wordKey, kept);
      }
    }

    // study_records / study_plans：改写 word_id，不标 dirty
    for (const name of ['studyRecord', 'studyPlan'] as const) {
      const key = entityKeys[name];
      if (!key) continue;
      const list = await getRawEntities(key);
      let changed = false;
      const rewritten = list.map((e: any) => {
        const next = mapId(e.word_id);
        if (next !== e.word_id) {
          changed = true;
          return { ...e, word_id: next };
        }
        return e;
      });
      if (changed) await rawSet(key, rewritten);
    }

    // articles：word_ids[] 替换，标 dirty
    const articleKey = entityKeys.article;
    if (articleKey) {
      const list = await getRawEntities(articleKey);
      let changed = false;
      const rewritten = list.map((a: any) => {
        if (!Array.isArray(a.word_ids) || !a.word_ids.some((id: string) => redirectMap.has(id))) return a;
        changed = true;
        return { ...a, word_ids: a.word_ids.map(mapId), dirty: true };
      });
      if (changed) await rawSet(articleKey, rewritten);
    }

    // exam_sessions：questions[].word_id 与 answers[].question.word_id，标 dirty
    const examKey = entityKeys.examSession;
    if (examKey) {
      const list = await getRawEntities(examKey);
      let changed = false;
      const rewritten = list.map((s: any) => {
        const hitQ = Array.isArray(s.questions)
          && s.questions.some((q: any) => q && redirectMap.has(q.word_id));
        const hitA = Array.isArray(s.answers)
          && s.answers.some((ans: any) => ans?.question && redirectMap.has(ans.question.word_id));
        if (!hitQ && !hitA) return s;
        changed = true;
        return {
          ...s,
          questions: Array.isArray(s.questions) ? s.questions.map(rewriteQuestion) : s.questions,
          answers: Array.isArray(s.answers)
            ? s.answers.map((ans: any) =>
                ans?.question ? { ...ans, question: rewriteQuestion(ans.question) } : ans
              )
            : s.answers,
          dirty: true,
        };
      });
      if (changed) await rawSet(examKey, rewritten);
    }

    // wrong_questions：question.word_id，标 dirty
    const wqKey = entityKeys.wrongQuestion;
    if (wqKey) {
      const list = await getRawEntities(wqKey);
      let changed = false;
      const rewritten = list.map((wq: any) => {
        if (!wq.question || !redirectMap.has(wq.question.word_id)) return wq;
        changed = true;
        return { ...wq, question: rewriteQuestion(wq.question), dirty: true };
      });
      if (changed) await rawSet(wqKey, rewritten);
    }

    console.log('[Sync] 应用 word id 重定向', redirects.length, '条');
  } catch (err: any) {
    // 重定向收敛失败不致命：下次同步服务端会幂等地下发同样的重定向
    console.warn('[Sync] 应用 word 重定向失败:', err?.message || err);
  }
}

/**
 * 一次性孤儿词对账（cursorVersion 升到 v3 的那次全量重拉后调用）。
 *
 * 背景：服务端同词去重上线后、旧版客户端升级前的窗口期，旧客户端推送的同词会被服务端
 * 合并（服务端从不保存那个冗余 id），但旧客户端不处理重定向，本地残留一行"孤儿重复词"。
 * 它从未进入服务端（migration 清不到）、也不再 dirty 推送（applyWordRedirects 触发不了），
 * 只能靠全量对账识别：全量重拉拿到服务端权威词集合后——
 *   - 本地未软删词的 id 在服务端权威集合里 → 保留；
 *   - id 不在服务端、但服务端有同 lower(word) 的 canonical 词 → 孤儿重复，移除并迁移引用；
 *   - id 不在服务端、服务端也无同词 → 纯本地未上传新词（会正常 dirty 推送），保留。
 * canonical 一定是服务端权威 id，避免本地选错与服务端分叉。
 */
async function reconcileOrphanWords(
  serverEntities: Record<string, any[]>,
  entityKeys: Record<string, string>
): Promise<void> {
  try {
    const serverWords = Array.isArray(serverEntities.word) ? serverEntities.word : [];
    const serverIds = new Set(serverWords.map((w: any) => w.id));
    // 服务端未软删词：lower(word) → canonical id（migration 后同词至多一条，重复取末条兜底）
    const activeByWord = new Map<string, string>();
    for (const w of serverWords) {
      if (!w.deleted_at && typeof w.word === 'string') {
        activeByWord.set(w.word.toLowerCase(), w.id);
      }
    }

    const wordKey = entityKeys.word;
    if (!wordKey) return;
    const localWords = await getRawEntities(wordKey);

    const redirects: WordRedirect[] = [];
    for (const w of localWords) {
      if (w.deleted_at) continue;
      if (serverIds.has(w.id)) continue; // 服务端权威认识
      const canon = activeByWord.get(String(w.word ?? '').toLowerCase());
      if (canon && canon !== w.id) {
        redirects.push({ from: w.id, to: canon });
      }
      // 无 canonical：纯本地未上传新词，保留待推送
    }

    if (redirects.length) {
      await applyWordRedirects(redirects, entityKeys);
      console.log('[Sync] 对账清理孤儿重复词', redirects.length, '个');
    }
  } catch (err: any) {
    // 对账失败不致命：哨兵版本号已推进，不阻塞正常同步；最坏情况是孤儿词保留到下次手动处理
    console.warn('[Sync] 孤儿词对账失败:', err?.message || err);
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
