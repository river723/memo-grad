/**
 * 系列故事内容抽象层。
 *
 * 网络版改造前：StoryListScreen / StoryDetailScreen 直接 import stories.json。
 * 改造后：统一走这里的函数，内部包「远程 API + AsyncStorage 缓存 + 本地 fallback」。
 *
 * 设计要点：
 * - getStorySeries() 只拉元信息 + 章节列表（不含正文，~1 KB）
 * - getStoryChapter(chapterId) 按章拉全文（单章 ~35 KB），带内存/AsyncStorage 缓存
 * - 上一章/下一章导航从 series 章节列表查（chapterId 是内容索引，数字稳定）
 * - 降级开关 EXPO_PUBLIC_USE_REMOTE_CONTENT=false 时走 import 的本地 JSON
 */

import storiesFallback from '../data/stories.json';
import StorageService from '../services/StorageService';
import { StoryApi, StorySeriesMetaWire, StoryChapterWire } from '../services/StoryApi';
import type { StorySeries } from '../types';

const USE_REMOTE = process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT !== 'false';

const fallbackStories = storiesFallback as unknown as StorySeries;

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

// ---- 内存 cache ----
let memSeries: StorySeriesMeta | null = null;
const memChapters = new Map<number, StoryChapterFull>();

function storageSeriesKey(): string {
  return StorageService.contentKey('story_series_v1');
}

function storageChapterKey(chapterId: number): string {
  return StorageService.contentKey(`story_chapter_${chapterId}_v1`);
}

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
function fallbackMeta(): StorySeriesMeta {
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

async function readSeriesFromStorage(): Promise<StorySeriesMeta | null> {
  try {
    const raw = await StorageService._rawGetItem(storageSeriesKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StorySeriesMeta;
    if (!parsed || !parsed.chapters || !parsed.storyId) return null;
    return parsed;
  } catch (err) {
    console.warn('[storyContent] 读 AsyncStorage 系列缓存失败：', err);
    return null;
  }
}

async function writeSeriesToStorage(meta: StorySeriesMeta): Promise<void> {
  try {
    await StorageService._rawSetItem(storageSeriesKey(), JSON.stringify(meta));
  } catch (err) {
    console.warn('[storyContent] 写 AsyncStorage 系列缓存失败：', err);
  }
}

async function readChapterFromStorage(chapterId: number): Promise<StoryChapterFull | null> {
  try {
    const raw = await StorageService._rawGetItem(storageChapterKey(chapterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoryChapterFull;
    if (!parsed || !parsed.content) return null;
    return parsed;
  } catch (err) {
    console.warn('[storyContent] 读 AsyncStorage 章节缓存失败：', err);
    return null;
  }
}

async function writeChapterToStorage(chapter: StoryChapterFull): Promise<void> {
  try {
    await StorageService._rawSetItem(storageChapterKey(chapter.id), JSON.stringify(chapter));
  } catch (err) {
    console.warn('[storyContent] 写 AsyncStorage 章节缓存失败：', err);
  }
}

/**
 * 拉系列元信息 + 章节列表。
 * 优先级：内存 → AsyncStorage → 远程（ETag 协商）→ 本地 JSON fallback。
 */
export async function getStorySeries(): Promise<StorySeriesMeta> {
  if (memSeries) return memSeries;

  const fromStorage = await readSeriesFromStorage();
  if (fromStorage) memSeries = fromStorage;

  if (!USE_REMOTE) {
    memSeries = fallbackMeta();
    return memSeries;
  }

  try {
    // 先探测远程是否有系列（fallback 的 storyId 不可用，这里用一个探测请求）
    // 设计：远程没有 story 时 API 404，这里回落到 fallback。
    const probe = await StoryApi.getSeries();
    if (probe) {
      memSeries = wireMetaToMeta(probe);
      await writeSeriesToStorage(memSeries);
      return memSeries;
    }
  } catch (err) {
    console.warn('[storyContent] 拉取故事系列失败：', err);
    if (fromStorage) return fromStorage;
  }

  memSeries = fallbackMeta();
  return memSeries;
}

/**
 * 拉单章全文。内部先取系列（找 storyId），再按章拉。
 * 远程失败时回落 AsyncStorage 旧值或本地 JSON。
 */
export async function getStoryChapter(chapterId: number): Promise<StoryChapterFull | null> {
  const mem = memChapters.get(chapterId);
  if (mem) return mem;

  const fromStorage = await readChapterFromStorage(chapterId);
  if (fromStorage) memChapters.set(chapterId, fromStorage);

  if (!USE_REMOTE) {
    const ch = fallbackStories.chapters.find((c) => c.id === chapterId);
    if (ch) memChapters.set(chapterId, ch);
    return ch ?? null;
  }

  try {
    const series = await getStorySeries();
    if (series.storyId === 'local-fallback') {
      // 后端没数据：直接用 fallback
      const ch = fallbackStories.chapters.find((c) => c.id === chapterId);
      return ch ?? null;
    }
    const wire = await StoryApi.getChapter(series.storyId, chapterId);
    if (wire) {
      const chapter = wireChapterToChapter(wire);
      memChapters.set(chapterId, chapter);
      await writeChapterToStorage(chapter);
      return chapter;
    }
  } catch (err) {
    console.warn(`[storyContent] 拉取第 ${chapterId} 章失败：`, err);
    if (fromStorage) return fromStorage;
  }

  const ch = fallbackStories.chapters.find((c) => c.id === chapterId);
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
