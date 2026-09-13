import {
  localToday,
  normalizeStage,
  isNewWord,
  isDue,
  intervalForStage,
  advanceOnPass,
  buildDailyQueue,
  deriveStageFromRecords,
} from '../services/scheduler';

const TODAY = '2026-09-12';

function w(partial: { review_stage?: number | null; next_due_date?: string | null } = {}) {
  return { word: 'x', ...partial };
}

describe('scheduler 阶梯映射', () => {
  test('intervalForStage：1..6 对应 [1,2,4,7,15,30]，越界钳制', () => {
    expect([1, 2, 3, 4, 5, 6].map(intervalForStage)).toEqual([1, 2, 4, 7, 15, 30]);
    expect(intervalForStage(0)).toBe(1);
    expect(intervalForStage(99)).toBe(30);
  });

  test('normalizeStage 处理空值/非法值', () => {
    expect(normalizeStage(undefined)).toBe(0);
    expect(normalizeStage(null)).toBe(0);
    expect(normalizeStage(NaN)).toBe(0);
    expect(normalizeStage(9)).toBe(6);
    expect(normalizeStage(-2)).toBe(0);
  });
});

describe('advanceOnPass 过关推进/回退', () => {
  test('首次答对：逐级推进，顶格停在 6 并按 30 天循环', () => {
    expect(advanceOnPass(0, TODAY, true)).toEqual({ stage: 1, nextDue: '2026-09-13' });
    expect(advanceOnPass(1, TODAY, true)).toEqual({ stage: 2, nextDue: '2026-09-14' });
    expect(advanceOnPass(2, TODAY, true)).toEqual({ stage: 3, nextDue: '2026-09-16' });
    expect(advanceOnPass(5, TODAY, true)).toEqual({ stage: 6, nextDue: '2026-10-12' });
    expect(advanceOnPass(6, TODAY, true)).toEqual({ stage: 6, nextDue: '2026-10-12' });
  });

  test('答错失救（firstTry=false）：新词仍为 1，旧词回退一档、按短间隔', () => {
    expect(advanceOnPass(undefined, TODAY, false)).toEqual({ stage: 1, nextDue: '2026-09-13' });
    expect(advanceOnPass(1, TODAY, false)).toEqual({ stage: 1, nextDue: '2026-09-13' });
    expect(advanceOnPass(3, TODAY, false)).toEqual({ stage: 2, nextDue: '2026-09-14' });
    expect(advanceOnPass(6, TODAY, false)).toEqual({ stage: 5, nextDue: '2026-09-27' });
  });
});

describe('isDue 到期判定', () => {
  test('stage>=1 且到期日 <= 今天才到期', () => {
    expect(isDue(w({ review_stage: 1, next_due_date: '2026-09-10' }), TODAY)).toBe(true); // 漏学，补
    expect(isDue(w({ review_stage: 1, next_due_date: TODAY }), TODAY)).toBe(true);
    expect(isDue(w({ review_stage: 1, next_due_date: '2026-09-13' }), TODAY)).toBe(false); // 明天
    expect(isDue(w({ review_stage: 1, next_due_date: '2026-10-12' }), TODAY)).toBe(false);
  });
  test('新词（stage 0）即使有到期日也不算复习', () => {
    expect(isDue(w({ review_stage: 0, next_due_date: '2026-09-01' }), TODAY)).toBe(false);
    expect(isNewWord(w({ review_stage: 0 }))).toBe(true);
    expect(isNewWord(w({}))).toBe(true);
    expect(isNewWord(w({ review_stage: 1 }))).toBe(false);
  });
});

describe('buildDailyQueue 每日队列', () => {
  const words = [
    { word: 'n1', review_stage: 0 },
    { word: 'n2', review_stage: 0 },
    { word: 'n3', review_stage: 0 },
    { word: 'r1', review_stage: 1, next_due_date: '2026-09-11' },
    { word: 'r2', review_stage: 3, next_due_date: TODAY },
    { word: 'r3', review_stage: 2, next_due_date: '2026-09-20' }, // 未到期
  ];

  test('新词按上限取、复习全部到期词（不封顶），顺序为新词在前', () => {
    const q = buildDailyQueue(words, TODAY, 2);
    expect(q.newWords.map((x) => x.word)).toEqual(['n1', 'n2']);
    expect(q.dueReviews.map((x) => x.word)).toEqual(['r1', 'r2']);
  });

  test('dailyLimit 非法时不取新词，复习仍全取', () => {
    const q = buildDailyQueue(words, TODAY, 0);
    expect(q.newWords).toHaveLength(0);
    expect(q.dueReviews.map((x) => x.word)).toEqual(['r1', 'r2']);
  });
});

describe('deriveStageFromRecords 迁移回填', () => {
  test('按不同"答对日期"数推阶段，到期日=最近通过日+间隔', () => {
    const r = deriveStageFromRecords([
      { word_id: 'a', study_date: '2026-09-01', result: 1 },
      { word_id: 'a', study_date: '2026-09-03', result: 0 },
      { word_id: 'a', study_date: '2026-09-03', result: 1 }, // 同日对错各一，只算 1 天
      { word_id: 'a', study_date: '2026-09-06', result: 1 },
    ]);
    expect(r.stage).toBe(3);
    expect(r.nextDue).toBe('2026-09-10'); // 09-06 + 4
  });

  test('通过日超过 6 天封顶 stage 6', () => {
    const recs = Array.from({ length: 8 }, (_, i) => ({
      word_id: 'a',
      study_date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      result: 1,
    }));
    expect(deriveStageFromRecords(recs).stage).toBe(6);
  });

  test('从无答对记录 → stage 0 / 未排期', () => {
    expect(deriveStageFromRecords([{ word_id: 'a', study_date: '2026-09-01', result: 0 }]))
      .toEqual({ stage: 0, nextDue: null });
    expect(deriveStageFromRecords([])).toEqual({ stage: 0, nextDue: null });
  });
});

describe('localToday', () => {
  test('返回 yyyy-MM-dd 形态', () => {
    expect(localToday(new Date('2026-09-12T08:30:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
