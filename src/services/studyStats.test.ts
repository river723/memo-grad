import { countPassedWords } from '../services/studyStats';

/**
 * 「今日完成」= 今日至少答对一次的不同单词数。
 * 口径取 StudyRecord（追加式、天然单调）而不是 StudyPlan.completed
 * （单调布尔但走 last-write-wins，跨设备会丢失更新）。
 */
describe('countPassedWords 今日完成词数', () => {
  test('空记录为 0', () => {
    expect(countPassedWords([])).toBe(0);
  });

  test('只答对：按 word_id 去重计数', () => {
    expect(countPassedWords([
      { word_id: 'w1', result: 1 },
      { word_id: 'w2', result: 1 },
    ])).toBe(2);
  });

  test('同一词答对多次只算一次', () => {
    expect(countPassedWords([
      { word_id: 'w1', result: 1 },
      { word_id: 'w1', result: 1 },
      { word_id: 'w1', result: 1 },
    ])).toBe(1);
  });

  test('重试救回（答错后答对）算一次完成', () => {
    expect(countPassedWords([
      { word_id: 'w1', result: 0 },
      { word_id: 'w1', result: 0 },
      { word_id: 'w1', result: 1 },
    ])).toBe(1);
  });

  test('只答错、从未答对不算完成', () => {
    expect(countPassedWords([
      { word_id: 'w1', result: 0 },
      { word_id: 'w2', result: 0 },
    ])).toBe(0);
  });

  test('空串 word_id 是新词占位哨兵，不计入', () => {
    expect(countPassedWords([
      { word_id: '', result: 1 },
      { word_id: 'w1', result: 1 },
    ])).toBe(1);
  });

  test('缺字段 / 非数字 result / 非字符串 word_id 一律不计', () => {
    expect(countPassedWords([
      { word_id: 'w1', result: '1' },
      { word_id: 123 as any, result: 1 },
      { word_id: 'w2' },
      { result: 1 },
      undefined as any,
      null as any,
    ])).toBe(0);
  });

  test('混合场景：答对去重 + 答错剔除 + 哨兵剔除', () => {
    expect(countPassedWords([
      { word_id: 'w1', result: 1 },
      { word_id: 'w1', result: 0 },
      { word_id: 'w2', result: 0 },
      { word_id: 'w2', result: 1 },
      { word_id: 'w3', result: 1 },
      { word_id: 'w3', result: 1 },
      { word_id: '', result: 1 },
    ])).toBe(3);
  });
});
