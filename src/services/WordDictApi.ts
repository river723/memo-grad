/**
 * 词库公共 API 客户端。
 *
 * 与 ApiClient 解耦，原因：
 * - 词库端点是公开的（不需要 JWT 注入）
 * - ETag/304 协商需要「If-None-Match 命中时返回 null」的特殊语义，
 *   改 ApiClient 会污染所有调用方的类型
 * - 服务端 Cache-Control 已经覆盖 30 天强缓存，304 路径只在版本切换时走
 *
 * 端点：/api/worddict/{meta, full, words/:word, by-letter/:prefix,
 *                     versions/:version/words}
 */

const BASE_URL = __DEV__ ? 'http://127.0.0.1:3000' : 'https://api.memograd.cn';

export interface WordDictMeta {
  version: string;
  wordCount: number;
  etag: string;
  publishedAt: string;
}

export interface WordDefinitionWire {
  part_of_speech: string;
  meaning: string;
  example?: string;
  is_core?: boolean;
  is_rare_sense?: boolean;
}

export interface SimilarWordWire {
  word: string;
  relation: 'spelling' | 'meaning' | 'root';
  description: string;
}

/**
 * 词条 wire 形态——直接对齐后端 WordDictEntry + 序列化后的命名。
 * 字段名沿用前端 camelCase（suggestedDifficulty / examFrequency / memoryTip），
 * 与 src/types/index.ts 的 WordDictEntry 一致，service 层零翻译。
 */
export interface WordDictEntryWire {
  word: string;
  definitions: WordDefinitionWire[];
  etymology?: string;
  similar_words: SimilarWordWire[];
  suggestedDifficulty?: number;
  examFrequency?: number;
  memoryTip?: string;
}

export interface GetFullResult {
  version: string;
  etag: string;
  entries: WordDictEntryWire[];
}

export class WordDictApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'WordDictApiError';
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
  throw new WordDictApiError(
    res.status,
    body?.error?.code ?? 'HTTP_ERROR',
    body?.error?.message ?? `词库 API 失败 (${op}, ${res.status})`
  );
}

/** 调 GET；带 etag 时若服务端 304 返回 null，调用方应继续使用本地缓存。 */
async function getWithEtag<T>(path: string, opts: FetchOpts, op: string): Promise<T | null> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.etag) headers['if-none-match'] = opts.etag;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
      signal: opts.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WordDictApiError(0, 'NETWORK_ERROR', `词库 API 网络错误 (${op}): ${msg}`);
  }

  if (res.status === 304) return null;
  return getJsonOrThrow<T>(res, op);
}

export const WordDictApi = {
  /**
   * 拉当前版本元信息。
   * @returns Meta 对象；带 etag 时命中 304 返回 null。
   */
  async getMeta(opts: FetchOpts = {}): Promise<WordDictMeta | null> {
    return getWithEtag<WordDictMeta>('/api/worddict/meta', opts, 'getMeta');
  },

  /**
   * 拉全量词条（4.79 MB）。
   * @returns GetFullResult；带 etag 时命中 304 返回 null。
   */
  async getFull(opts: FetchOpts = {}): Promise<GetFullResult | null> {
    return getWithEtag<GetFullResult>('/api/worddict/full', opts, 'getFull');
  },

  /**
   * 拉单条词条。404 由调用方处理为 null。
   */
  async getWord(word: string, opts: FetchOpts = {}): Promise<WordDictEntryWire | null> {
    const encoded = encodeURIComponent(word.trim().toLowerCase());
    try {
      const res = await getWithEtag<{ entry: WordDictEntryWire }>(
        `/api/worddict/words/${encoded}`,
        opts,
        'getWord'
      );
      return res?.entry ?? null;
    } catch (err) {
      if (err instanceof WordDictApiError && err.statusCode === 404) return null;
      throw err;
    }
  },

  /**
   * 按首字母前缀（a-z）拉词条列表。
   */
  async getByPrefix(
    prefix: string,
    opts: FetchOpts = {}
  ): Promise<{ prefix: string; count: number; entries: WordDictEntryWire[] } | null> {
    const lower = prefix.toLowerCase();
    return getWithEtag<{ prefix: string; count: number; entries: WordDictEntryWire[] }>(
      `/api/worddict/by-letter/${encodeURIComponent(lower)}`,
      opts,
      'getByPrefix'
    );
  },

  /**
   * 拉指定历史版本全量（admin 排查用）。
   */
  async getVersionWords(
    version: string,
    opts: FetchOpts = {}
  ): Promise<{ version: string; etag: string; publishedAt: string; entries: WordDictEntryWire[] } | null> {
    return getWithEtag<{
      version: string;
      etag: string;
      publishedAt: string;
      entries: WordDictEntryWire[];
    }>(
      `/api/worddict/versions/${encodeURIComponent(version)}/words`,
      opts,
      'getVersionWords'
    );
  },
};
