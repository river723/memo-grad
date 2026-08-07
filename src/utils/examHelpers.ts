import { Word } from '../types';
import { REVIEW_INTERVALS } from '../constants';

/**
 * 练习出词优先级算法。
 *
 * 桶优先级（高 -> 低）：
 *   p0  今天到期该复习的词（基于上次学习日期 + 按正确率选取的复习间隔）
 *   p1  文章未覆盖 + 正确率 < 80%
 *   p2  文章未覆盖 + 正确率 ≥ 80%
 *   p3  文章覆盖 1 次 + 正确率 < 80%
 *   p4  文章覆盖 1 次 + 正确率 ≥ 80%
 *   rest 文章覆盖 ≥ 2 但 < 3
 *
 * 各桶内打乱后按优先级拼接，取前 count 个。排除文章覆盖 ≥ 3 次的词。
 */
export function getRecommendedWords(
  words: Word[],
  coverage: Map<string, number>,
  accuracy: Map<string, number>,
  count: number,
  lastStudyDate?: Map<string, string>,
  today: Date = new Date(),
): Word[] {
  if (words.length === 0) return [];

  const p0: Word[] = []; // 今天到期复习（最高优先级）
  const p1: Word[] = []; // 未覆盖 + 正确率 < 80%
  const p2: Word[] = []; // 未覆盖 + 正确率 ≥ 80%
  const p3: Word[] = []; // 覆盖 1 次 + 正确率 < 80%
  const p4: Word[] = []; // 覆盖 1 次 + 正确率 ≥ 80%
  const rest: Word[] = []; // 覆盖 ≥ 2 但 < 3

  for (const word of words) {
    if (!word.id) continue;
    const cov = coverage.get(word.id) || 0;
    const acc = accuracy.get(word.id) ?? 1;

    if (cov >= 3) continue; // 排除已覆盖 ≥ 3 次

    // 今天到期该复习的词优先级最高
    const lastDate = lastStudyDate?.get(word.id);
    if (lastDate && isDueForReview(lastDate, acc, today)) {
      p0.push(word);
      continue;
    }

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
  const pool = [
    ...shuffle(p0),
    ...shuffle(p1),
    ...shuffle(p2),
    ...shuffle(p3),
    ...shuffle(p4),
    ...shuffle(rest),
  ];

  return pool.slice(0, count);
}

/**
 * 判断单词今天是否到期复习：
 * 距上次学习天数 >= 按正确率选取的艾宾浩斯间隔。
 * 正确率高 -> 用更长的间隔（拉长复习周期）；正确率低 -> 用短间隔尽快回顾。
 */
function isDueForReview(lastStudyDate: string, accuracy: number, today: Date): boolean {
  const last = new Date(lastStudyDate + 'T00:00:00');
  if (isNaN(last.getTime())) return false;
  const daysSince = Math.floor((today.getTime() - last.getTime()) / 86400000);
  if (daysSince < 0) return false;

  const idx = accuracy >= 0.8 ? 3 : accuracy >= 0.5 ? 2 : 1; // 7 天 / 4 天 / 2 天
  const targetInterval = REVIEW_INTERVALS[idx] ?? REVIEW_INTERVALS[0];
  return daysSince >= targetInterval;
}
