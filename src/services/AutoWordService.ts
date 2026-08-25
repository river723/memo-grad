/**
 * 自动配词 —— 每天按考频从词库自动补足生词本。
 *
 * 语义（补足缺口）：生词本中"从未学过的新词"存量不足「每日新词数」时，
 * 只补差值；存量足够则当天不动作。手动添加的词照常计入存量。
 *
 * 选词顺序：考研频次（frequency）从高到低分档；同一频次档内用当天日期作
 * 种子的确定性 Fisher-Yates 打乱轮换——同一天多次调用结果一致，跨天遇到
 * 不同的词，避免每次都从同一批字母序最靠前的词开始。
 *
 * 排除：已在生词本的词（含软删除——用户删过的词不能被自动加回）、
 * 词库选词页的忽略词（IGNORED_WORDBANK_WORDS）。
 */

import { format } from 'date-fns';
import StorageService from './StorageService';
import { getLocalWordDictWords } from '../utils/wordUtils';
import { Word } from '../types';

class AutoWordService {
  private static instance: AutoWordService;

  static getInstance(): AutoWordService {
    if (!AutoWordService.instance) {
      AutoWordService.instance = new AutoWordService();
    }
    return AutoWordService.instance;
  }

  /** 并发去重：HomeScreen 聚焦等场景可能同时触发多次。 */
  private inflight: Promise<number> | null = null;

  /**
   * 补足生词本到「每日新词数」。
   * 默认每天只跑一次（日期守卫）；`force: true` 跳过守卫——
   * 用于学习页「再来一组」按需补充下一批，开关关闭时同样不动作。
   */
  async fillTodayIfNeeded(options?: { force?: boolean }): Promise<number> {
    if (!this.inflight) {
      this.inflight = this.doFill(options?.force === true).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doFill(force: boolean): Promise<number> {
    try {
      const settings = await StorageService.getSettings();
      if (settings.autoAddNewWords !== true) {
        console.info('[AutoWordService] 开关关闭，跳过');
        return 0;
      }

      const today = format(new Date(), 'yyyy-MM-dd');
      if (!force && (await StorageService.getAutoFillLastDate()) === today) {
        console.info('[AutoWordService] 今日已执行过，跳过');
        return 0;
      }

      const dailyLimit = typeof settings.dailyNewWords === 'number'
        ? settings.dailyNewWords
        : 10;

      // 缺口 = 每日新词数 − 生词本里从未学过的新词存量
      const [words, records] = await Promise.all([
        StorageService.getWords(),
        StorageService.getStudyRecords(),
      ]);
      const studiedIds = new Set(records.map(r => r.word_id));
      const unstudiedCount = words.filter(w => !studiedIds.has(w.id)).length;
      const gap = dailyLimit - unstudiedCount;
      if (gap <= 0) {
        await StorageService.setAutoFillLastDate(today);
        return 0;
      }

      // 候选池：全量词库剔除 已有（含软删除）+ 忽略
      const [wordbookKeys, ignoredList, wordbank] = await Promise.all([
        StorageService.getWordbookKeysIncludingDeleted(),
        StorageService.getIgnoredWordbankWords(),
        getLocalWordDictWords(),
      ]);
      const ignored = new Set(ignoredList.map(w => w.toLowerCase()));
      const candidates = wordbank.filter(entry => {
        const key = entry.word.toLowerCase();
        return !wordbookKeys.has(key) && !ignored.has(key);
      });

      let added = 0;
      if (candidates.length === 0) {
        // 词库已耗尽（全部已有/忽略/软删）：不写守卫，下次进入可重试
        console.warn('[AutoWordService] 词库无候选词可补');
        return 0;
      }
      const ordered = this.pickByFrequency(candidates, today);
      for (const entry of ordered.slice(0, gap)) {
        await StorageService.addWord(entry);
        added++;
      }

      await StorageService.setAutoFillLastDate(today);
      if (added > 0) {
        console.log(`[AutoWordService] ${today} 自动配词 ${added} 个`);
      }
      return added;
    } catch (error) {
      console.error('[AutoWordService] 自动配词失败:', error);
      return 0;
    }
  }

  /**
   * 频次降序分档 + 档内按日期种子确定性打乱。
   * 不用 Math.random()：同一天重复调用得到同一批词。
   */
  private pickByFrequency(
    candidates: Omit<Word, 'id' | 'created_at' | 'updated_at'>[],
    today: string
  ): Omit<Word, 'id' | 'created_at' | 'updated_at'>[] {
    const groups = new Map<number, typeof candidates>();
    for (const entry of candidates) {
      const list = groups.get(entry.frequency);
      if (list) {
        list.push(entry);
      } else {
        groups.set(entry.frequency, [entry]);
      }
    }

    const rand = this.mulberry32(this.dateSeed(today));
    const ordered: typeof candidates = [];
    const freqs = Array.from(groups.keys()).sort((a, b) => b - a);
    for (const freq of freqs) {
      const group = groups.get(freq)!;
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      ordered.push(...group);
    }
    return ordered;
  }

  /** 当天日期数字作为种子，如 2026-08-25 → 20260825。 */
  private dateSeed(date: string): number {
    return Number(date.replace(/-/g, '')) || 0;
  }

  /** mulberry32：小型确定性 PRNG，够做洗牌用。 */
  private mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

export default AutoWordService.getInstance();
