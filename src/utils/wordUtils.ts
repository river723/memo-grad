import { Word, AppSettings, AIResponse, WordDictEntry, WordDictJson } from '../types';
import worddictJson from '../data/worddict.json';

const worddict = worddictJson as WordDictJson;

/**
 * 判断词条是否为「骨架词」——本地词库直接加入但还没经过 AI 增强的。
 * 增强后 etymology / definitions[].example / similar_words 至少有一项为空。
 */
export function needsWordEnhancement(w: Word): boolean {
  const hasEty = !!(w.etymology && w.etymology.trim());
  const hasExample = (w.definitions || []).some(
    (d) => d.example && d.example.trim()
  );
  const hasSimilar = Array.isArray(w.similar_words) && w.similar_words.length > 0;
  return !hasEty || !hasExample || !hasSimilar;
}

/** AI 增强条件是否具备：是骨架词 + 有 API key + 有 model */
export function canWordBeEnhanced(
  word: Word | null | undefined,
  settings: AppSettings | null | undefined
): boolean {
  return !!(
    word &&
    needsWordEnhancement(word) &&
    settings?.apiKey &&
    settings?.aiModel
  );
}

/**
 * 把 AIResponse 合并到既有 Word 里，按规则覆盖：
 *  - definitions / difficulty: AI 优先覆盖，AI 缺失则保留原值
 *  - etymology / similar_words: AI 优先，回落原值
 *  - pronunciation_uk/us / frequency / id / word: 不改
 */
export function mergeAIResultIntoWord(
  w: Word,
  result: AIResponse
): Partial<Word> {
  return {
    definitions:
      Array.isArray(result.definitions) && result.definitions.length > 0
        ? result.definitions
        : w.definitions,
    etymology: result.etymology || w.etymology,
    similar_words: Array.isArray(result.similar_words)
      ? result.similar_words
      : w.similar_words,
    difficulty:
      typeof result.suggestedDifficulty === 'number'
        ? clampDifficulty(result.suggestedDifficulty)
        : w.difficulty,
  };
}

function clampDifficulty(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/** 从本地增强词典读取单词分析结果，命中时可直接复用 AIResponse 合并逻辑。 */
export function getLocalWordDictResult(word: string): AIResponse | null {
  const key = word.trim().toLowerCase();
  const entry = worddict.results[key];
  if (!entry) return null;

  return {
    definitions: entry.definitions,
    etymology: entry.etymology,
    similar_words: entry.similar_words,
    suggestedDifficulty: entry.suggestedDifficulty,
  };
}

/** 把 worddict 的对象映射词条转换成应用内 Word 结构。 */
export function wordDictEntryToWord(
  word: string,
  entry: WordDictEntry
): Omit<Word, 'id' | 'created_at' | 'updated_at'> {
  return {
    word,
    definitions: entry.definitions,
    etymology: entry.etymology,
    similar_words: Array.isArray(entry.similar_words) ? entry.similar_words : [],
    difficulty: clampDifficulty(entry.suggestedDifficulty),
    frequency: 2,
  };
}

/** 本地增强词典的候选列表，供选词页直接使用。 */
export function getLocalWordDictWords(): Omit<Word, 'id' | 'created_at' | 'updated_at'>[] {
  return Object.entries(worddict.results).map(([word, entry]) =>
    wordDictEntryToWord(word, entry)
  );
}
