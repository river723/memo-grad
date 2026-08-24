/**
 * 真题内容抽象层。
 *
 * 网络版改造前：6 个 screen 直接 import src/data/realExams.json。
 * 改造后：统一走这里的函数，内部包「远程 API + AsyncStorage 缓存 + 本地 fallback」。
 *
 * 设计要点：
 * - getExamSet(year, setId) 拉单套卷（~150 KB），列表屏按展开年份懒加载，
 *   不再一次加载全部 17 年。
 * - getExamYears() 只拉年份元数据（~1 KB），用于列表屏顶部年份卡。
 * - 降级开关 EXPO_PUBLIC_USE_REMOTE_CONTENT=false 时走 import 的本地 JSON，
 *   与老代码行为等价。
 */

import realExamsFallback from '../data/realExams.json';
import StorageService from '../services/StorageService';
import { RealExamApi } from '../services/RealExamApi';
import { REMOTE_CONTENT } from '../config/appMode';
import type { RealExamYear } from '../types';

const USE_REMOTE = REMOTE_CONTENT;

const fallbackExams = realExamsFallback as unknown as RealExamYear[];

export type SetId = 'english1' | 'english2';

/** 一套卷的内容（与 RealExamYear['english1'] 同构）。 */
export type ExamSet = RealExamYear['english1'];

type CachedPaper = {
  year: number;
  setId: SetId;
  etag: string;
  savedAt: number;
  set: ExamSet;
};

/** 内存 cache（最快）。key=`${year}-${setId}`。 */
const memPapers = new Map<string, CachedPaper>();

function cacheKey(year: number, setId: SetId): string {
  return `${year}-${setId}`;
}

function storageKeyFor(year: number, setId: SetId): string {
  return StorageService.contentKey(`real_exam_paper_${year}_${setId}_v1`);
}

/** wire → 前端 RealExamYear 形态转换（只剥离 year/setId/paperIds 包装层）。 */
function wireToSet(wire: NonNullable<Awaited<ReturnType<typeof RealExamApi.getPaper>>>): ExamSet {
  const { reading, cloze, newType, translation, writing } = wire;
  // 数据与前端类型同源（seed 脚本原样搬运 JSON），仅字面量联合类型
  // （answer/subtype 等在 wire 里是 string）需要 cast 收敛。
  return {
    reading: reading as unknown as ExamSet['reading'],
    cloze: (cloze ?? null) as unknown as ExamSet['cloze'],
    newType: (newType ?? null) as unknown as ExamSet['newType'],
    translation: (translation ?? null) as unknown as ExamSet['translation'],
    writing: (writing ?? null) as unknown as ExamSet['writing'],
  };
}

async function readPaperFromStorage(year: number, setId: SetId): Promise<CachedPaper | null> {
  try {
    const raw = await StorageService._rawGetItem(storageKeyFor(year, setId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPaper;
    if (!parsed || !parsed.set) return null;
    return parsed;
  } catch (err) {
    console.warn('[realExamContent] 读 AsyncStorage 真题缓存失败：', err);
    return null;
  }
}

async function writePaperToStorage(cache: CachedPaper): Promise<void> {
  try {
    await StorageService._rawSetItem(
      storageKeyFor(cache.year, cache.setId),
      JSON.stringify(cache)
    );
  } catch (err) {
    console.warn('[realExamContent] 写 AsyncStorage 真题缓存失败：', err);
  }
}

/**
 * 拉取一套卷（year + setId）。
 *
 * 缓存优先级：内存 → AsyncStorage → 远程（ETag 协商）→ 本地 JSON fallback。
 * 远程失败时使用旧缓存（可能过期）；无任何缓存时抛错让调用方走空态。
 */
export async function getExamSet(year: number, setId: SetId): Promise<ExamSet> {
  const key = cacheKey(year, setId);
  const mem = memPapers.get(key);
  if (mem) return mem.set;

  const fromStorage = await readPaperFromStorage(year, setId);
  if (fromStorage) {
    memPapers.set(key, fromStorage);
  }

  if (!USE_REMOTE) {
    const y = fallbackExams.find((x) => x.year === year);
    if (!y) throw new Error(`未找到 ${year} 年真题`);
    const set = y[setId];
    memPapers.set(key, { year, setId, etag: 'fallback', savedAt: Date.now(), set });
    return set;
  }

  try {
    const wire = await RealExamApi.getPaper(year, setId, fromStorage ? { etag: fromStorage.etag } : {});
    if (wire !== null) {
      // 200：服务端有内容（或更新），刷新缓存
      const set = wireToSet(wire);
      const cache: CachedPaper = {
        year,
        setId,
        etag: wire.etag,
        savedAt: Date.now(),
        set,
      };
      memPapers.set(key, cache);
      await writePaperToStorage(cache);
      return set;
    }
    // 304：继续用本地缓存
    if (fromStorage) return fromStorage.set;
  } catch (err) {
    console.warn(`[realExamContent] 拉取 ${year}-${setId} 失败：`, err);
    if (fromStorage) return fromStorage.set;
  }

  // 远程不可用且无缓存 → fallback
  const y = fallbackExams.find((x) => x.year === year);
  if (!y) throw new Error(`未找到 ${year} 年真题`);
  return y[setId];
}

/** 年份列表（倒序）。来源：远程 /api/exams/years 或本地 fallback。 */
export async function getExamYears(): Promise<number[]> {
  if (!USE_REMOTE) {
    return [...fallbackExams].sort((a, b) => b.year - a.year).map((y) => y.year);
  }
  try {
    const meta = await RealExamApi.getYears();
    // 远程返回非空年份列表才直接使用；空数组（如库未灌数据）视为无可服务内容，回落本地。
    if (meta && meta.years.length > 0) {
      return meta.years.map((y) => y.year).sort((a, b) => b - a);
    }
    if (meta) {
      console.warn('[realExamContent] 远程年份列表为空，使用本地 fallback');
    }
  } catch (err) {
    console.warn('[realExamContent] 拉取年份列表失败，使用 fallback：', err);
  }
  return [...fallbackExams].sort((a, b) => b.year - a.year).map((y) => y.year);
}

/**
 * 单题反查（错题复习用）。
 * 远程调 /api/exams/questions/:questionId；失败回落本地 JSON 查找。
 */
export async function getExamQuestion(questionId: string): Promise<{
  question: { id: string; stem: string; options: string[]; answer: string; explanation?: string };
  paper: { id: string; title: string; passage: string; paragraphs: Array<{ en: string; zh: string }> };
} | null> {
  if (!USE_REMOTE) {
    return findQuestionInFallback(questionId);
  }
  try {
    const res = await RealExamApi.getQuestion(questionId);
    if (res) return res;
  } catch (err) {
    console.warn(`[realExamContent] 单题反查失败（${questionId}）：`, err);
  }
  return findQuestionInFallback(questionId);
}

/** 在本地 fallback JSON 里找单题（与远程形态对齐）。 */
function findQuestionInFallback(questionId: string) {
  const m = /^(\d{4}-e[12]-text[1-4])-q(\d+)$/.exec(questionId);
  if (!m) return null;
  const passageId = m[1];
  for (const y of fallbackExams) {
    for (const setId of ['english1', 'english2'] as const) {
      const set = y[setId];
      const passage = set.reading.find((p) => p.id === passageId);
      if (!passage) continue;
      const question = passage.questions.find((q) => q.id === questionId);
      if (!question) continue;
      return {
        question: {
          id: question.id,
          stem: (question as unknown as { stem?: string }).stem ?? '',
          options: (question as unknown as { options?: string[] }).options ?? [],
          answer: (question as unknown as { answer: string }).answer,
          explanation: question.explanation,
        },
        paper: {
          id: passage.id,
          title: passage.title ?? '',
          passage: passage.passage,
          paragraphs: passage.paragraphs ?? [],
        },
      };
    }
  }
  return null;
}
