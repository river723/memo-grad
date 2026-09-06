/**
 * 词条相关的纯函数 + 词库访问抽象层。
 *
 * 词库访问入口（getLocalWordDictResult / getLocalWordDictWords）原本直接
 * import src/data/worddict.json。网络版改造后改成 async：
 *   1. 内存 cache（最快路径）
 *   2. AsyncStorage 缓存（跨进程持久化）
 *   3. HTTP 调 /api/worddict/full（带 If-None-Match）
 *   4. 远程失败 → 回落到 import 的本地 JSON
 *
 * 降级开关 EXPO_PUBLIC_USE_REMOTE_CONTENT=false 时直接走 import 路径，
 * 与老代码行为等价——审核前测试或老仓库分支切换用。
 */

import { Word, AppSettings, AIResponse, WordDictEntry, WordDictJson } from '../types';
import { loadJson } from './lazyJson';
import StorageService from '../services/StorageService';
import { WordDictApi, WordDictEntryWire, WordDictMeta } from '../services/WordDictApi';
import { REMOTE_CONTENT } from '../config/appMode';

// `process.env.EXPO_PUBLIC_*` 在 Expo 编译时被静态替换；运行时为字面量。
// 默认 true：生产用远程；本地审核或老分支对比设 false。
// 单机形态（OFFLINE_MODE）强制走本地 JSON，见 src/config/appMode.ts。
const USE_REMOTE = REMOTE_CONTENT;

const localFallbackVersion = 'local-fallback';
const localFallbackEtag = 'local-fallback';
const localFallbackPublishedAt = '1970-01-01T00:00:00.000Z';

/**
 * 本地 fallback 词库（4.9MB JSON）的懒加载入口。
 * 动态 import() 让 webpack 把它拆成独立 chunk，只有真正落到 fallback 时才加载；
 * 在线场景走远程 + AsyncStorage，完全不会触发。
 */
let localFallbackPromise: Promise<WordDictJson> | null = null;
function getLocalFallback(): Promise<WordDictJson> {
  if (!localFallbackPromise) {
    localFallbackPromise = loadJson<WordDictJson>(() => import('../data/worddict.json'));
  }
  return localFallbackPromise;
}

type CachedShape = {
  version: string;
  etag: string;
  savedAt: number;
  /** key=小写单词，value=WordDictEntryWire（与服务端形态一致） */
  entries: Record<string, WordDictEntryWire>;
};

/** 内存 cache（最快）。启动时从 AsyncStorage 填充，远程拉取后更新。 */
let memCache: CachedShape | null = null;

/** 并发首次加载的合并 Promise——避免多个 screen 同时 await 触发 N 次请求。 */
let loadPromise: Promise<CachedShape> | null = null;

function clampDifficulty(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * 把 wire 形态的词条转成 AIResponse 形态（与 getLocalWordDictResult 旧签名兼容）。
 * AIResponse 是 AI 增强流程的输入/输出格式，与 worddict 词条字段一致只是命名约定。
 */
function wireToAIResponse(entry: WordDictEntryWire): AIResponse {
  return {
    definitions: entry.definitions,
    etymology: entry.etymology,
    similar_words: entry.similar_words,
    suggestedDifficulty: entry.suggestedDifficulty,
    examFrequency: entry.examFrequency,
    memoryTip: entry.memoryTip,
  };
}

async function readCacheFromStorage(): Promise<CachedShape | null> {
  try {
    const raw = await StorageService._rawGetItem(
      StorageService.contentKey('worddict_full_v1')
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedShape;
    if (!parsed || !parsed.entries || !parsed.etag) return null;
    return parsed;
  } catch (err) {
    console.warn('[wordUtils] 读 AsyncStorage 词库缓存失败：', err);
    return null;
  }
}

async function writeCacheToStorage(cache: CachedShape): Promise<void> {
  try {
    await StorageService._rawSetItem(
      StorageService.contentKey('worddict_full_v1'),
      JSON.stringify(cache)
    );
  } catch (err) {
    console.warn('[wordUtils] 写 AsyncStorage 词库缓存失败：', err);
  }
}

/**
 * 加载或刷新词库缓存。返回最终可用的 cache。
 * 失败时回落到 import 的本地 JSON，保证离线 / 审核前 / 远程挂时仍可用。
 */
async function ensureLoaded(): Promise<CachedShape> {
  if (memCache) return memCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // 1. AsyncStorage 持久化层
    const fromStorage = await readCacheFromStorage();
    if (fromStorage) memCache = fromStorage;

    if (!USE_REMOTE) {
      if (!memCache) {
        // 降级开关下用本地 JSON 当 cache，等价于老行为
        const fb = await getLocalFallback();
        memCache = {
          version: localFallbackVersion,
          etag: localFallbackEtag,
          savedAt: Date.now(),
          entries: fb.results as unknown as Record<string, WordDictEntryWire>,
        };
      }
      return memCache;
    }

    // 2. 远程：先用 meta 校验版本，再决定是否拉全量
    try {
      const remoteMeta = await WordDictApi.getMeta(
        memCache ? { etag: memCache.etag } : {}
      );
      // 304 → 服务端认为本地 cache 仍是最新；继续用 memCache
      // 200 → meta 有更新（或首次拉取），需要继续拉 full
      if (remoteMeta === null) {
        if (!memCache) {
          // 不可能：304 必然意味着有 etag 对应的本地数据。兜底走 full。
          const full = await WordDictApi.getFull();
          if (full) {
            memCache = {
              version: full.version,
              etag: full.etag,
              savedAt: Date.now(),
              entries: indexByWord(full.entries),
            };
            await writeCacheToStorage(memCache);
          }
        }
      } else {
        // meta 拉到了；要么首次（memCache null），要么 etag 不一致（需要刷新 full）
        if (!memCache || memCache.etag !== remoteMeta.etag) {
          const full = await WordDictApi.getFull();
          if (full) {
            memCache = {
              version: full.version,
              etag: full.etag,
              savedAt: Date.now(),
              entries: indexByWord(full.entries),
            };
            await writeCacheToStorage(memCache);
          }
        }
      }
    } catch (err) {
      console.warn('[wordUtils] 远程词库拉取失败，使用本地缓存或 fallback：', err);
    }

    // 3. 三道保险都没成功时，落到 import JSON
    if (!memCache) {
      const fb = await getLocalFallback();
      memCache = {
        version: localFallbackVersion,
        etag: localFallbackEtag,
        savedAt: Date.now(),
        entries: fb.results as unknown as Record<string, WordDictEntryWire>,
      };
    }

    return memCache;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function indexByWord(entries: WordDictEntryWire[]): Record<string, WordDictEntryWire> {
  const map: Record<string, WordDictEntryWire> = {};
  for (const e of entries) {
    map[e.word.toLowerCase()] = e;
  }
  return map;
}

// =====================================================================
// 对外 API：保留旧函数签名，仅同步 → async。
// =====================================================================

/**
 * 从本地增强词典读取单词分析结果，命中时可直接复用 AIResponse 合并逻辑。
 *
 * 异步（之前是同步）。改造后内部走「内存 → AsyncStorage → 远程 → import」四层。
 */
export async function getLocalWordDictResult(word: string): Promise<AIResponse | null> {
  const cache = await ensureLoaded();
  const key = word.trim().toLowerCase();
  const entry = cache.entries[key];
  return entry ? wireToAIResponse(entry) : null;
}

/**
 * 把 worddict 的对象映射词条转换成应用内 Word 结构。
 *
 * 同步（无需网络）。该函数本身不变——它只是数据形态转换，
 * 网络版改造把它从一个「隐式依赖 worddict.json 导入」的同步函数，
 * 升级为「明确接收一份 entry 参数」的纯函数。
 */
export function wordDictEntryToWord(
  word: string,
  entry: WordDictEntry
): Omit<Word, 'id' | 'created_at' | 'updated_at'> {
  return {
    word,
    definitions: entry.definitions,
    etymology: entry.etymology,
    similar_words: Array.isArray(entry.similar_words) ? entry.similar_words : [],
    memory_tip: entry.memoryTip,
    difficulty: clampDifficulty(entry.suggestedDifficulty),
    frequency:
      typeof entry.examFrequency === 'number'
        ? clampDifficulty(entry.examFrequency)
        : 2,
  };
}

/**
 * 本地增强词典的候选列表，供选词页直接使用。
 *
 * 异步（之前是同步）。批量场景（WordbankPicker）会一次性拿全量
 * 4801 条，命中内存 cache 路径应在 50ms 内返回。
 */
export async function getLocalWordDictWords(): Promise<Omit<Word, 'id' | 'created_at' | 'updated_at'>[]> {
  const cache = await ensureLoaded();
  return Object.entries(cache.entries).map(([word, entry]) =>
    wordDictEntryToWord(word, entry as unknown as WordDictEntry)
  );
}

/**
 * 拉当前词库版本元信息（version + wordCount + etag）。
 * 主要给 DICTIONARIES 卡片用，异步获取真实 wordCount。
 */
export async function getLocalWordDictMeta(): Promise<WordDictMeta> {
  await ensureLoaded();
  if (memCache) {
    return {
      version: memCache.version,
      wordCount: Object.keys(memCache.entries).length,
      etag: memCache.etag,
      publishedAt: new Date(memCache.savedAt).toISOString(),
    };
  }
  // memCache 理论上被 ensureLoaded 保证非空；万一为空（未来改动引入回归），
  // 直接读 fallback 兜底，避免抛错。
  const fb = await getLocalFallback();
  return {
    version: localFallbackVersion,
    wordCount: Object.keys(fb.results).length,
    etag: localFallbackEtag,
    publishedAt: localFallbackPublishedAt,
  };
}

// =====================================================================
// 与词库无关的纯函数（保持同步原状）
// =====================================================================

/**
 * 判断词条是否为「骨架词」——本地词库直接加入但还没经过 AI 增强的。
 * 增强后 etymology / definitions[].example / similar_words 至少有一项为空。
 */
export function needsWordEnhancement(w: Word): boolean {
  const hasEty = !!(w.etymology && w.etymology.trim());
  const hasExample = (w.definitions || []).some(
    (d) => d.example && d.example.trim()
  );
  const hasSimilar = Array.isArray(w.similar_words) && w.similar_words.length > 0;
  return !hasEty || !hasExample || !hasSimilar;
}

/** AI 增强条件是否具备：是骨架词 + 有 API key + 有 model */
export function canWordBeEnhanced(
  word: Word | null | undefined,
  settings: AppSettings | null | undefined
): boolean {
  return !!(
    word &&
    needsWordEnhancement(word) &&
    settings?.apiKey &&
    settings?.aiModel
  );
}

/**
 * 把 AIResponse 合并到既有 Word 里，按规则覆盖：
 *  - definitions / difficulty: AI 优先覆盖，AI 缺失则保留原值
 *  - etymology / similar_words / memory_tip: AI 优先，回落原值
 *  - difficulty / frequency: AI 提供则覆盖，缺失保留原值
 *  - pronunciation_uk/us / id / word: 不改
 */
export function mergeAIResultIntoWord(
  w: Word,
  result: AIResponse
): Partial<Word> {
  return {
    definitions:
      Array.isArray(result.definitions) && result.definitions.length > 0
        ? result.definitions
        : w.definitions,
    etymology: result.etymology || w.etymology,
    similar_words: Array.isArray(result.similar_words)
      ? result.similar_words
      : w.similar_words,
    memory_tip: result.memoryTip || w.memory_tip,
    difficulty:
      typeof result.suggestedDifficulty === 'number'
        ? clampDifficulty(result.suggestedDifficulty)
        : w.difficulty,
    frequency:
      typeof result.examFrequency === 'number'
        ? clampDifficulty(result.examFrequency)
        : w.frequency,
  };
}

/**
 * 基于种子的确定性乱序（Fisher–Yates + 线性同余伪随机）。
 * 同一 seed 得到同一顺序，便于「再点乱序」时用新 seed 重洗，
 * 且不依赖 Math.random，渲染可复现。不修改入参，返回新数组。
 */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = (seed || 1) >>> 0;
  const next = () => {
    // LCG 参数（Numerical Recipes）
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
