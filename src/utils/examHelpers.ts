import { Word } from '../types';

/**
 * 覆盖度优先级算法 —— 与趣味文章选词逻辑完全一致。
 * 按 (文章覆盖率, 学习正确率) 将单词分入优先级桶，打乱后取前 count 个。
 */
export function getRecommendedWords(
  words: Word[],
  coverage: Map<number, number>,
  accuracy: Map<number, number>,
  count: number
): Word[] {
  if (words.length === 0) return [];

  const p1: Word[] = []; // 未覆盖 + 正确率 < 80%
  const p2: Word[] = []; // 未覆盖 + 正确率 ≥ 80%
  const p3: Word[] = []; // 覆盖 1 次 + 正确率 < 80%
  const p4: Word[] = []; // 覆盖 1 次 + 正确率 ≥ 80%
  const rest: Word[] = []; // 覆盖 ≥ 2 但 < 3

  for (const word of words) {
    if (word.id == null) continue;
    const cov = coverage.get(word.id) || 0;
    const acc = accuracy.get(word.id) ?? 1;

    if (cov >= 3) continue; // 排除已覆盖 ≥ 3 次

    if (cov === 0) {
      if (acc < 0.8) p1.push(word);
      else p2.push(word);
    } else if (cov === 1) {
      if (acc < 0.8) p3.push(word);
      else p4.push(word);
    } else {
      rest.push(word);
    }
  }

  const shuffle = (arr: Word[]) => arr.sort(() => Math.random() - 0.5);
  const pool = [...shuffle(p1), ...shuffle(p2), ...shuffle(p3), ...shuffle(p4), ...shuffle(rest)];

  return pool.slice(0, count);
}
