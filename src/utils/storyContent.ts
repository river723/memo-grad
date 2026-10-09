/**
 * 系列故事内容抽象层。
 *
 * 网络版改造前：StoryListScreen / StoryDetailScreen 直接 import stories.json。
 * 改造后：统一走这里的函数，内部包「远程 API + 本地 JSON fallback」。
 *
 * 设计要点：
 * - getStorySeries() 只拉元信息 + 章节列表（不含正文，~1 KB）
 * - getStoryChapter(chapterId) 按章拉全文（单章 ~35 KB），带进程内缓存
 * - 上一章/下一章导航从 series 章节列表查（chapterId 是内容索引，数字稳定）
 * - 降级开关 EXPO_PUBLIC_USE_REMOTE_CONTENT=false 时直接走本地 JSON
 *
 * 缓存策略：只用进程内缓存 + HTTP 层 max-age，**不用 AsyncStorage**。
 *   章节 key 历史上是 `story_chapter_${chapterId}` —— 只按章节号编号、
 *   不含 storyId，换系列后新旧系列的 chapter 1..20 key 完全重叠，
 *   旧正文会被当成新系列内容一直读出来（标题新、正文旧的脏读）。
 *   HTTP 层已按 `max-age=30d` 缓存响应，App 层不必再存一份。
 */

import { loadJson } from './lazyJson';
import { StoryApi, StorySeriesMetaWire, StoryChapterWire } from '../services/StoryApi';
import { REMOTE_CONTENT } from '../config/appMode';
import type { StorySeries } from '../types';

const USE_REMOTE = REMOTE_CONTENT;

/**
 * 本地 fallback 故事集（745KB JSON）的懒加载入口。
 * 动态 import() 拆成独立 chunk，只有走到 fallback 路径时才加载。
 */
let storiesFallbackPromise: Promise<StorySeries> | null = null;
function getFallbackStories(): Promise<StorySeries> {
  if (!storiesFallbackPromise) {
    storiesFallbackPromise = loadJson<StorySeries>(() => import('../data/stories.json'));
  }
  return storiesFallbackPromise;
}

/** 系列元信息 + 章节列表（不含正文）。 */
export type StorySeriesMeta = {
  storyId: string;
  seriesTitle: string;
  totalChapters: number;
  totalWords: number;
  chapters: Array<{ chapterId: number; title: string; wordCount: number; theme: string }>;
};

/** 单章全文（与前端 StoryChapter 同构）。 */
export type StoryChapterFull = {
  id: number;
  title: string;
  content: string;
  translation: string;
  words: string[];
  word_count: number;
  theme: string;
};

// ---- 内存 cache（进程内，跨启动不持久化）----
// 刻意不写 AsyncStorage：章节 key 历史上是 `story_chapter_${chapterId}`，
// 只按章节号编号、不含 storyId，换系列后新旧正文共用同一 key 互相污染。
// 远程响应本身由 HTTP 层 `max-age` 缓存，App 层无需再存一份。
let memSeries: StorySeriesMeta | null = null;
const memChapters = new Map<number, StoryChapterFull>();

/** wire 章节元信息 → 抽象层形态。 */
function wireMetaToMeta(wire: StorySeriesMetaWire): StorySeriesMeta {
  return {
    storyId: wire.id,
    seriesTitle: wire.seriesTitle,
    totalChapters: wire.totalChapters,
    totalWords: wire.totalWords,
    chapters: wire.chapters,
  };
}

/** wire 章节全文 → 抽象层形态（字段名与前端 StoryChapter 对齐）。 */
function wireChapterToChapter(wire: StoryChapterWire): StoryChapterFull {
  return {
    id: wire.id,
    title: wire.title,
    content: wire.content,
    translation: wire.translation,
    words: wire.words,
    word_count: wire.word_count,
    theme: wire.theme,
  };
}

/** fallback 的系列元信息（本地 JSON 形态转换）。 */
async function fallbackMeta(): Promise<StorySeriesMeta> {
  const fallbackStories = await getFallbackStories();
  return {
    storyId: 'local-fallback',
    seriesTitle: fallbackStories.series_title,
    totalChapters: fallbackStories.total_chapters,
    totalWords: fallbackStories.total_words,
    chapters: fallbackStories.chapters.map((c) => ({
      chapterId: c.id,
      title: c.title,
      wordCount: c.word_count,
      theme: c.theme,
    })),
  };
}

/**
 * 拉系列元信息 + 章节列表。
 *
 * 内存（进程内）→ 远程（ETag 协商）→ 本地 JSON。
 *
 * 刻意**不**用 AsyncStorage 做跨启动缓存：HTTP 层已按 `max-age` 缓存
 * `/api/stories`，App 层再存一份只会留下旧值——换系列后远程拉新成功、
 * 但本层「缓存优先 + 命中即返回」会让旧系列元信息长期残留。
 */
export async function getStorySeries(): Promise<StorySeriesMeta> {
  if (memSeries) return memSeries;

  if (!USE_REMOTE) {
    memSeries = await fallbackMeta();
    return memSeries;
  }

  try {
    const probe = await StoryApi.getSeries();
    if (probe) {
      memSeries = wireMetaToMeta(probe);
      return memSeries;
    }
  } catch (err) {
    console.warn('[storyContent] 拉取故事系列失败：', err);
  }

  memSeries = await fallbackMeta();
  return memSeries;
}

/**
 * 拉单章正文。
 *
 * 内存 → 远程 → 本地 JSON（离线模式或远程失败）。
 *
 * 同上，章节也**不**落 AsyncStorage：章节缓存 key 历史上是
 * `story_chapter_${chapterId}` —— 只按章节号编号、不含 storyId，
 * 换系列后两个系列的 chapter 1..20 key 完全重叠，旧正文会被当成新系列
 * 内容一直读出来。改为远程优先 + 无 App 层缓存后，正常路径每次都拿
 * 当前系列的正文；离网兜底走本地 JSON（离线包与 stories.json 同源）。
 *
 * 代价：每次冷启动每章多一次 HTTP 往返。HTTP 层 `max-age=30d`
 * 使同一响应期内浏览器不会重复请求，实际带宽开销可控。
 */
export async function getStoryChapter(chapterId: number): Promise<StoryChapterFull | null> {
  const mem = memChapters.get(chapterId);
  if (mem) return mem;

  if (USE_REMOTE) {
    try {
      const series = await getStorySeries();
      if (series.storyId !== 'local-fallback') {
        const wire = await StoryApi.getChapter(series.storyId, chapterId);
        if (wire) {
          const chapter = wireChapterToChapter(wire);
          memChapters.set(chapterId, chapter);
          return chapter;
        }
      }
    } catch (err) {
      console.warn(`[storyContent] 拉取第 ${chapterId} 章失败：`, err);
    }
  }

  const fallbackStories = await getFallbackStories();
  const ch = fallbackStories.chapters.find((c) => c.id === chapterId);
  if (ch) memChapters.set(chapterId, ch);
  return ch ?? null;
}

/** 上一章/下一章章节号（基于系列章节列表）。 */
export async function getAdjacentChapterIds(chapterId: number): Promise<{ prev?: number; next?: number }> {
  const series = await getStorySeries();
  const idx = series.chapters.findIndex((c) => c.chapterId === chapterId);
  if (idx < 0) return {};
  return {
    prev: idx > 0 ? series.chapters[idx - 1].chapterId : undefined,
    next: idx < series.chapters.length - 1 ? series.chapters[idx + 1].chapterId : undefined,
  };
}
