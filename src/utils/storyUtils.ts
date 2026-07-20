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
