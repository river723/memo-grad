/**
 * 间隔重复（艾宾浩斯）调度内核 —— 纯函数，无 RN / AsyncStorage 依赖。
 *
 * 调度状态直接挂在 Word 上（随云同步）：
 *   - review_stage：0 = 新词（从未过关）；1..MAX_REVIEW_STAGE = 已进入复习阶梯的档数。
 *   - next_due_date：'yyyy-MM-dd' 本地日期，下次到期复习日；null = 未排期（新词）。
 *
 * 选队只看这两个字段：stage>=1 且 next_due_date<=今天 的词即"到期"，过关后把
 * next_due 推到下一档的未来日期，词当天就自动离开到期集合。不再依赖预铺的复习计划。
 */

import { format, addDays } from 'date-fns';
import { REVIEW_INTERVALS, MAX_REVIEW_STAGE, NEW_WORD_STAGE } from '../constants/schedule';

/** 只要求具备调度字段的最小单词结构（Word  structurally satisfies）。 */
export interface SchedulableWord {
  review_stage?: number | null;
  next_due_date?: string | null;
}

/** 迁移回填时需要的最小学习记录结构。 */
export interface StudyRecordLike {
  word_id?: string;
  study_date?: string;
  result?: number;
}

export interface AdvanceResult {
  stage: number;
  nextDue: string;
}

/** 本地 'yyyy-MM-dd'，全调度统一用本地日期（避免 UTC 跨日错位）。 */
export function localToday(from: Date = new Date()): string {
  return format(from, 'yyyy-MM-dd');
}

/** 规整为 0..MAX 的整数阶段；null/undefined/NaN 一律视为新词阶段 0。 */
export function normalizeStage(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.trunc(raw) : NEW_WORD_STAGE;
  if (!Number.isFinite(n)) return NEW_WORD_STAGE;
  return Math.min(Math.max(n, NEW_WORD_STAGE), MAX_REVIEW_STAGE);
}

/** 是否为从未过关的新词。 */
export function isNewWord<W extends SchedulableWord>(word: W): boolean {
  return normalizeStage(word.review_stage) === NEW_WORD_STAGE;
}

/** 某阶段对应的复习间隔（天）；阶段 1..MAX → REVIEW_INTERVALS 各档，顶格按最后一档(30)循环。 */
export function intervalForStage(stage: number): number {
  const s = Math.min(Math.max(normalizeStage(stage), 1), MAX_REVIEW_STAGE);
  return REVIEW_INTERVALS[s - 1];
}

/**
 * 该词今天是否到期需要复习：
 * 已进入阶梯(stage>=1)、有到期日，且到期日 <= 今天（字符串 'yyyy-MM-dd' 可直接比较）。
 * 漏掉的日子（到期日落在过去）也算到期，自动补复习。
 */
export function isDue<W extends SchedulableWord>(word: W, today: string = localToday()): boolean {
  const stage = normalizeStage(word.review_stage);
  const due = word.next_due_date;
  return stage >= 1 && typeof due === 'string' && due.length > 0 && due <= today;
}

function parseLocalDate(dateStr: string): Date {
  // 补 T00:00:00 按本地零点解析，避免 new Date('yyyy-MM-dd') 被当成 UTC 造成跨日偏移。
  return new Date(`${dateStr}T00:00:00`);
}

/**
 * 一次"过关"后推进/回退阶段并算出下次到期日。
 * @param currentStage 词当前阶段
 * @param today        本地日期串
 * @param firstTry     本次是否首次作答就答对（true=顺利推进；false=答错过、靠重试救回，保守回退）
 */
export function advanceOnPass(
  currentStage: number | null | undefined,
  today: string,
  firstTry: boolean
): AdvanceResult {
  const cur = normalizeStage(currentStage);
  let stage: number;
  if (firstTry) {
    stage = Math.min(cur + 1, MAX_REVIEW_STAGE);
  } else {
    // 救回：新词仍定为第 1 档；已在阶梯上的词回退一档（至少留在第 1 档），按短间隔尽快再见。
    stage = cur >= 1 ? Math.max(1, cur - 1) : 1;
  }
  const nextDue = format(addDays(parseLocalDate(today), intervalForStage(stage)), 'yyyy-MM-dd');
  return { stage, nextDue };
}

export interface DailyQueue<W> {
  /** 今日新词（按传入顺序稳定取前 dailyLimit 个）。 */
  newWords: W[];
  /** 今日到期复习词（全部，不封顶）。 */
  dueReviews: W[];
}

/**
 * 从整本生词本派生今日学习队列。
 * 新词取阶段 0 的前 dailyLimit 个；到期复习取所有 isDue 的词，不限量。
 */
export function buildDailyQueue<W extends SchedulableWord>(
  words: W[],
  today: string = localToday(),
  dailyLimit: number
): DailyQueue<W> {
  const safeLimit = Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.floor(dailyLimit) : 0;
  const newWords: W[] = [];
  const dueReviews: W[] = [];
  for (const w of words) {
    if (isNewWord(w)) {
      if (newWords.length < safeLimit) newWords.push(w);
    } else if (isDue(w, today)) {
      dueReviews.push(w);
    }
  }
  return { newWords, dueReviews };
}

/**
 * 仅供一次性迁移回填：根据一个词的历史学习记录推断当前阶段与到期日。
 * 阶段 ≈ 该词"答对(result===1)的不同学习日期"个数（封顶 MAX）；
 * 到期日 = 最近一次答对日 + 当前阶段对应间隔（可能落在过去，即迁移后立即到期补复习）。
 * 没有任何答对记录 → 阶段 0、未排期（按新词处理）。
 */
export function deriveStageFromRecords(records: StudyRecordLike[]): {
  stage: number;
  nextDue: string | null;
} {
  const passedDates = new Set<string>();
  for (const r of records) {
    if (r && r.result === 1 && typeof r.study_date === 'string' && r.study_date.length > 0) {
      passedDates.add(r.study_date);
    }
  }
  if (passedDates.size === 0) {
    return { stage: NEW_WORD_STAGE, nextDue: null };
  }
  const stage = Math.min(passedDates.size, MAX_REVIEW_STAGE);
  const lastPass = Array.from(passedDates).sort().pop() as string;
  const nextDue = format(addDays(parseLocalDate(lastPass), intervalForStage(stage)), 'yyyy-MM-dd');
  return { stage, nextDue };
}
