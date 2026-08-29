import { Word } from '../types';

/**
 * 将文章内容按生词拆分为可渲染的段落片段。
 * 目标单词会被标记为 `isWord: true`，非目标文本标记为 `isWord: false`。
 */
export interface TextSegment {
  text: string;
  isWord: boolean;
  wordObj?: Word;
}

/**
 * 判断短文本是否像标题（无句末标点），用于识别英文正文开头多出的章节标题行。
 */
export function isTitleLike(text: string): boolean {
  const t = text.trim();
  if (!t || t.length >= 40) return false;
  return !/[.!?。！？]$/.test(t);
}

/**
 * 将英文正文与中文译文按 `\n\n` 拆成段落并按下标配对，得到段落级中英对照结构。
 * 处理英文开头多出的标题行、以及中英段数不等的情况。
 */
export function buildBilingualPairs(
  content: string,
  translation: string
): { en: string; zh?: string }[] {
  const enParas = content.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  const zhParas = translation
    ? translation.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
    : [];

  const pairs: { en: string; zh?: string }[] = [];

  let enStart = 0;
  if (
    enParas.length === zhParas.length + 1 &&
    zhParas.length > 0 &&
    isTitleLike(enParas[0])
  ) {
    pairs.push({ en: enParas[0] });
    enStart = 1;
  }

  const maxLen = Math.max(enParas.length - enStart, zhParas.length);
  for (let i = 0; i < maxLen; i++) {
    const en = enParas[enStart + i];
    const zh = zhParas[i];
    if (en !== undefined && zh !== undefined) {
      pairs.push({ en, zh });
    } else if (en !== undefined) {
      pairs.push({ en });
    } else if (zh !== undefined) {
      pairs.push({ en: '', zh });
    }
  }
  return pairs;
}

export function parseArticleContent(
  content: string,
  targetWords: string[],
  wordMap: Map<string, Word>
): TextSegment[] {
  if (!content || targetWords.length === 0) {
    return [{ text: content || '', isWord: false }];
  }

  // 构建正则：匹配所有目标单词（单词边界，大小写不敏感）
  const escapedWords = targetWords
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length); // 长词优先匹配
  const pattern = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    // 匹配前的普通文本
    if (match.index > lastIndex) {
      segments.push({
        text: content.substring(lastIndex, match.index),
        isWord: false,
      });
    }
    // 匹配的生词
    const matchedWord = match[0];
    const lowerWord = matchedWord.toLowerCase();
    segments.push({
      text: matchedWord,
      isWord: true,
      wordObj: wordMap.get(lowerWord),
    });
    lastIndex = pattern.lastIndex;
  }

  // 剩余文本
  if (lastIndex < content.length) {
    segments.push({
      text: content.substring(lastIndex),
      isWord: false,
    });
  }

  return segments;
}
