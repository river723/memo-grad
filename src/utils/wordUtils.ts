import { Word, AppSettings, AIResponse } from '../types';

/**
 * 判断词条是否为「骨架词」——本地词库直接加入但还没经过 AI 增强的。
 * 增强后 etymology / definitions[].example / similar_words 至少有一项非空。
 */
export function needsWordEnhancement(w: Word): boolean {
  const hasEty = !!(w.etymology && w.etymology.trim());
  const hasExample = (w.definitions || []).some(
    (d) => d.example && d.example.trim()
  );
  const hasSimilar = Array.isArray(w.similar_words) && w.similar_words.length > 0;
  return !hasEty && !hasExample && !hasSimilar;
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
        ? result.suggestedDifficulty
        : w.difficulty,
  };
}
