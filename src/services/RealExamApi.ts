/**
 * 真题内容公共 API 客户端。
 *
 * 与 WordDictApi 同构：独立 fetch、ETag/304 语义、公开端点（无需 JWT）。
 * 服务端返回的题面形态与前端类型（RealExamYear 等）对齐，
 * service 层直接透传不重映射。
 *
 * 端点：/api/exams/{years, :year/:setId, :year/:setId/reading,
 *                     :year/:setId/cloze, :year/:setId/newtype,
 *                     :year/:setId/translation, :year/:setId/writing,
 *                     questions/:questionId}
 */

import { API_BASE_URL as BASE_URL } from './apiConfig';

export interface ExamYearsMeta {
  years: Array<{ year: number; english1: boolean; english2: boolean }>;
}

/** 服务端序列化的阅读 passage（与前端 RealExamReadingPassage 形态一致）。 */
export interface ExamReadingWire {
  id: string;
  title: string;
  passage: string;
  paragraphs: Array<{ en: string; zh: string }>;
  questions: Array<{
    id: string;
    stem: string;
    options: string[];
    answer: string;
    explanation?: string;
  }>;
}

/** 服务端序列化的整套卷。 */
export interface ExamPaperWire {
  year: number;
  setId: 'english1' | 'english2';
  etag: string;
  paperIds: string[];
  reading: ExamReadingWire[];
  cloze: {
    id: string;
    passage: string;
    blanks: Array<{ index: number; options: string[]; answer: string; explanation?: string }>;
    paragraphs: Array<{ en: string; zh: string }>;
  } | null;
  newType: {
    id: string;
    subtype: string;
    direction: string;
    options: Array<{ letter: string; text: string; fixed?: boolean }>;
    questions: Array<{ index: number; stem?: string; answer: string; explanation?: string }>;
  } | null;
  translation: {
    id: string;
    subtype: string;
    direction: string;
    passage: string;
    items: Array<{ index: number; en: string; zh: string; note?: string }>;
  } | null;
  writing: {
    id: string;
    parts: Array<{ label: string; direction: string; sample?: string; sampleTranslation?: string; analysis?: string }>;
  } | null;
}

/** 单题反查结果（错题复习用）。 */
export interface ExamQuestionWire {
  question: { id: string; stem: string; options: string[]; answer: string; explanation?: string };
  paper: { id: string; title: string; passage: string; paragraphs: Array<{ en: string; zh: string }> };
}

export class RealExamApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RealExamApiError';
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
  throw new RealExamApiError(
    res.status,
    body?.error?.code ?? 'HTTP_ERROR',
    body?.error?.message ?? `真题 API 失败 (${op}, ${res.status})`
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
    throw new RealExamApiError(0, 'NETWORK_ERROR', `真题 API 网络错误 (${op}): ${msg}`);
  }

  if (res.status === 304) return null;
  return getJsonOrThrow<T>(res, op);
}

export const RealExamApi = {
  /** 拉所有年份+套卷可用性。 */
  async getYears(opts: FetchOpts = {}): Promise<ExamYearsMeta | null> {
    return getWithEtag<ExamYearsMeta>('/api/exams/years', opts, 'getYears');
  },

  /** 拉整套卷（5 种类型全含）。 */
  async getPaper(year: number, setId: 'english1' | 'english2', opts: FetchOpts = {}): Promise<ExamPaperWire | null> {
    return getWithEtag<ExamPaperWire>(`/api/exams/${year}/${setId}`, opts, 'getPaper');
  },

  /** 拉 4 篇阅读。 */
  async getReading(year: number, setId: 'english1' | 'english2', opts: FetchOpts = {}): Promise<{ reading: ExamReadingWire[] } | null> {
    return getWithEtag<{ reading: ExamReadingWire[] }>(`/api/exams/${year}/${setId}/reading`, opts, 'getReading');
  },

  /** 拉完形。 */
  async getCloze(year: number, setId: 'english1' | 'english2', opts: FetchOpts = {}): Promise<ExamPaperWire['cloze'] | null> {
    return getWithEtag<ExamPaperWire['cloze']>(`/api/exams/${year}/${setId}/cloze`, opts, 'getCloze');
  },

  /** 拉新题型。 */
  async getNewType(year: number, setId: 'english1' | 'english2', opts: FetchOpts = {}): Promise<ExamPaperWire['newType'] | null> {
    return getWithEtag<ExamPaperWire['newType']>(`/api/exams/${year}/${setId}/newtype`, opts, 'getNewType');
  },

  /** 拉翻译。 */
  async getTranslation(year: number, setId: 'english1' | 'english2', opts: FetchOpts = {}): Promise<ExamPaperWire['translation'] | null> {
    return getWithEtag<ExamPaperWire['translation']>(`/api/exams/${year}/${setId}/translation`, opts, 'getTranslation');
  },

  /** 拉写作。 */
  async getWriting(year: number, setId: 'english1' | 'english2', opts: FetchOpts = {}): Promise<ExamPaperWire['writing'] | null> {
    return getWithEtag<ExamPaperWire['writing']>(`/api/exams/${year}/${setId}/writing`, opts, 'getWriting');
  },

  /**
   * 单题反查（错题复习用）。
   * @returns question + paper；404 由调用方处理为 null。
   */
  async getQuestion(questionId: string, opts: FetchOpts = {}): Promise<ExamQuestionWire | null> {
    const encoded = encodeURIComponent(questionId);
    try {
      const res = await getWithEtag<ExamQuestionWire>(`/api/exams/questions/${encoded}`, opts, 'getQuestion');
      return res;
    } catch (err) {
      if (err instanceof RealExamApiError && err.statusCode === 404) return null;
      throw err;
    }
  },
};
