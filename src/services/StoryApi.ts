/**
 * 系列故事公共 API 客户端。
 *
 * 与 WordDictApi / RealExamApi 同构：独立 fetch、ETag/304 语义、公开端点。
 *
 * 端点：/api/stories、/api/stories/:storyId、/api/stories/:storyId/chapters/:chapterId、
 *       /api/stories/:storyId/full
 */

import { API_BASE_URL as BASE_URL } from './apiConfig';

export interface StorySeriesWire {
  id: string;
  seriesTitle: string;
  totalChapters: number;
  totalWords: number;
  /** 系列行最后更新时间（server 已按 desc 排序；客户端据此显式选最新）。 */
  updatedAt?: string;
}

/** 服务端序列化的系列元信息 + 章节列表（不含正文）。 */
export interface StorySeriesMetaWire {
  id: string;
  seriesTitle: string;
  totalWords: number;
  totalChapters: number;
  chapters: Array<{ chapterId: number; title: string; wordCount: number; theme: string }>;
}

/** 服务端序列化的章节全文（与前端 StoryChapter 字段对齐）。 */
export interface StoryChapterWire {
  id: number;
  title: string;
  content: string;
  translation: string;
  words: string[];
  word_count: number;
  theme: string;
}

export class StoryApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'StoryApiError';
  }
}

type FetchOpts = { etag?: string; signal?: AbortSignal };

async function getJsonOrThrow<T>(res: Response, op: string): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let body: { error?: { code?: string; message?: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    /* 4xx/5xx 可能无 JSON body */
  }
  throw new StoryApiError(
    res.status,
    body?.error?.code ?? 'HTTP_ERROR',
    body?.error?.message ?? `故事 API 失败 (${op}, ${res.status})`
  );
}

async function getWithEtag<T>(path: string, opts: FetchOpts, op: string): Promise<T | null> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.etag) headers['if-none-match'] = opts.etag;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
      signal: opts.signal,
      // 服务端 max-age=30d 会让浏览器把单章正文落进 HTTP 磁盘缓存 30 天，
      // 跨会话都不再请求——NAS 重生成某章后手机端立刻新文、web 最长 30 天才换。
      // 原生 RN fetch（OkHttp/NSURLSession）对 GET 不缓存，这里显式 no-store
      // 让 web 与原生行为对称。代价：每次进章节多一次网络往返（~35KB），
      // 对一个每次只翻一两章的阅读器来说可忽略。
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new StoryApiError(0, 'NETWORK_ERROR', `故事 API 网络错误 (${op}): ${msg}`);
  }

  if (res.status === 304) return null;
  return getJsonOrThrow<T>(res, op);
}

export const StoryApi = {
  /** 系列列表（客户端发现 storyId 用）。 */
  async getSeries(opts: FetchOpts = {}): Promise<StorySeriesMetaWire | null> {
    const list = await getWithEtag<{ series: StorySeriesWire[] }>('/api/stories', opts, 'getSeries');
    if (!list || list.series.length === 0) return null;
    // server 已按 updatedAt desc 排序；这里再显式取最新，避免盲取 series[0]
    // 依赖服务端排序约定（历史上曾因 asc 排序 + series[0] 而固定展示最老系列）。
    const first = [...list.series].sort((a, b) => {
      const da = a.updatedAt ? Date.parse(a.updatedAt) : NaN;
      const db = b.updatedAt ? Date.parse(b.updatedAt) : NaN;
      return (Number.isNaN(db) ? -Infinity : db) - (Number.isNaN(da) ? -Infinity : da);
    })[0];
    return getWithEtag<StorySeriesMetaWire>(`/api/stories/${first.id}`, opts, 'getSeriesMeta');
  },

  /** 单章全文。404 由调用方处理为 null。 */
  async getChapter(storyId: string, chapterId: number, opts: FetchOpts = {}): Promise<StoryChapterWire | null> {
    try {
      const res = await getWithEtag<{ chapter: StoryChapterWire }>(
        `/api/stories/${storyId}/chapters/${chapterId}`,
        opts,
        'getChapter'
      );
      return res?.chapter ?? null;
    } catch (err) {
      if (err instanceof StoryApiError && err.statusCode === 404) return null;
      throw err;
    }
  },
};
