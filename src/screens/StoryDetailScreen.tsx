import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import { parseArticleContent } from '../utils/storyUtils';
import { getLocalWordDictResult } from '../utils/wordUtils';
import { getStoryChapter, getAdjacentChapterIds, type StoryChapterFull } from '../utils/storyContent';
import type { Word } from '../types';
import AppButton from '../components/ds/AppButton';
import WordDictModal from '../components/WordDictModal';

/**
 * 判断短文本是否像标题（无句末标点），用于识别英文正文开头多出的章节标题行。
 */
function isTitleLike(text: string): boolean {
  const t = text.trim();
  if (!t || t.length >= 40) return false;
  return !/[.!?。！？]$/.test(t);
}

/**
 * 将英文正文与中文译文按 `\n\n` 拆成段落并按下标配对，得到段落级中英对照结构。
 */
function buildBilingualPairs(
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

export default function StoryDetailScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const typography = colors.typography;
  const route = useAppRoute<'StoryDetail'>();
  const { chapterId } = route.params as { chapterId: number };

  const [chapter, setChapter] = useState<StoryChapterFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjacent, setAdjacent] = useState<{ prev?: number; next?: number }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ch, adj] = await Promise.all([
          getStoryChapter(chapterId),
          getAdjacentChapterIds(chapterId),
        ]);
        if (!cancelled) {
          setChapter(ch);
          setAdjacent(adj);
        }
      } catch (err) {
        console.warn(`[StoryDetail] 拉取第 ${chapterId} 章失败：`, err);
        if (!cancelled) setChapter(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [showWordModal, setShowWordModal] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const [wordMap, setWordMap] = useState<Map<string, Word>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!chapter) {
        setWordMap(new Map());
        return;
      }
      const map = new Map<string, Word>();
      for (const w of chapter.words) {
        const entry = await getLocalWordDictResult(w);
        if (cancelled) return;
        if (!entry) continue;
        map.set(w.toLowerCase(), {
          id: '',
          word: w,
          definitions: entry.definitions || [],
          etymology: entry.etymology,
          similar_words: entry.similar_words || [],
          memory_tip: entry.memoryTip,
          difficulty: entry.suggestedDifficulty || 3,
          frequency: entry.examFrequency || 3,
        });
      }
      if (!cancelled) setWordMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [chapter]);

  const pairsWithSegs = useMemo(() => {
    if (!chapter) return [];
    const pairs = buildBilingualPairs(chapter.content, chapter.translation);
    return pairs.map(p => ({
      en: p.en,
      zh: p.zh,
      segs: parseArticleContent(p.en, chapter.words, wordMap),
    }));
  }, [chapter, wordMap]);

  const handleWordTap = useCallback((wordObj?: Word) => {
    if (wordObj) {
      setSelectedWord(wordObj);
      setShowWordModal(true);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.onSurfaceVariant }}>章节加载中…</Text>
      </View>
    );
  }

  if (!chapter) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.onSurfaceVariant }}>章节不存在</Text>
      </View>
    );
  }

  const prevChapter = adjacent.prev;
  const nextChapter = adjacent.next;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 88 }}>
        {/* Hero：章标题 + 词数 */}
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.primary, borderRadius: radius.xl },
            colors.shadow.card,
          ]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: typography.caption.size, letterSpacing: 0.6 }}>
              第 {chapter.id} 章
            </Text>
            <Text
              style={{
                color: colors.onPrimary,
                fontSize: typography.headline.size,
                lineHeight: typography.headline.lineHeight,
                fontWeight: '700',
                letterSpacing: -0.3,
              }}
              numberOfLines={3}
            >
              {chapter.title}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, marginTop: 2 }}>
              {chapter.word_count} 词 · {chapter.words.length} 个目标词
            </Text>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="book-open-page-variant" size={24} color={colors.onPrimary} />
            </View>
            {chapter.translation ? (
              <Pressable
                onPress={() => setShowTranslation(!showTranslation)}
                style={({ pressed }) => [styles.heroToggle, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons
                  name={showTranslation ? 'eye-off' : 'eye'}
                  size={14}
                  color="#FFFFFF"
                />
                <Text style={styles.heroToggleLabel}>
                  {showTranslation ? '隐藏译文' : '显示译文'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* 阅读正文 */}
        <View
          style={[
            styles.contentCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radius.lg,
            },
            colors.shadow.hairline,
          ]}
        >
          {pairsWithSegs.map((pair, index) => {
            const showEn = !!pair.en;
            const showZh = !!pair.zh && showTranslation;
            if (!showEn && !showZh) return null;
            return (
              <View key={index} style={styles.bilingualPara}>
                {showEn ? (
                  <Text style={styles.articleText}>
                    {pair.segs.map((seg, j) => {
                      if (seg.isWord) {
                        return (
                          <Text
                            key={j}
                            style={styles.highlightedWord}
                            onPress={() => handleWordTap(seg.wordObj)}
                          >
                            {seg.text}
                          </Text>
                        );
                      }
                      return <Text key={j}>{seg.text}</Text>;
                    })}
                  </Text>
                ) : null}
                {showZh ? (
                  <Text style={styles.bilingualZh}>{pair.zh}</Text>
                ) : null}
              </View>
            );
          })}

          {chapter.translation ? (
            <View style={styles.translationToggleArea}>
              <Pressable
                onPress={() => setShowTranslation(!showTranslation)}
                style={({ pressed }) => [
                  styles.translationToggle,
                  { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialCommunityIcons
                  name={showTranslation ? 'eye-off' : 'eye'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.translationToggleLabel}>
                  {showTranslation ? '隐藏译文' : '显示译文'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Text style={styles.tapHint}>
          💡 点击文中<Text style={{ color: colors.primary, fontWeight: '600' }}>蓝色高亮</Text>生词可查看释义
        </Text>
      </ScrollView>

      {/* 底部导航 */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.outline }]}>
        <AppButton
          title="上一章"
          onPress={() => prevChapter !== undefined && navigation.replace('StoryDetail', { chapterId: prevChapter })}
          variant="secondary"
          size="lg"
          disabled={prevChapter === undefined}
          style={{ flex: 1 }}
          leftIcon={<MaterialCommunityIcons name="chevron-left" size={20} color={prevChapter === undefined ? colors.tertiary : colors.primary} />}
        />
        <AppButton
          title="下一章"
          onPress={() => nextChapter !== undefined && navigation.replace('StoryDetail', { chapterId: nextChapter })}
          variant="secondary"
          size="lg"
          disabled={nextChapter === undefined}
          style={{ flex: 1 }}
          rightIcon={<MaterialCommunityIcons name="chevron-right" size={20} color={nextChapter === undefined ? colors.tertiary : colors.primary} />}
        />
      </View>

      {/* 释义弹窗（共享组件） */}
      <WordDictModal
        visible={showWordModal}
        onClose={() => setShowWordModal(false)}
        word={selectedWord}
      />
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 110,
    gap: 12,
    marginBottom: 16,
  },
  heroRight: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  contentCard: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  articleText: {
    fontSize: 16,
    color: colors.onSurface,
    lineHeight: 28,
  },
  highlightedWord: {
    color: colors.primary,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
    textDecorationStyle: 'solid',
  },
  translationToggleArea: {
    alignItems: 'center',
    marginTop: 16,
  },
  translationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  translationToggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  bilingualPara: {
    marginBottom: 16,
  },
  bilingualZh: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    lineHeight: 22,
    marginTop: 6,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryContainer,
  },
  tapHint: {
    fontSize: 12,
    color: colors.tertiary,
    textAlign: 'center',
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    borderTopWidth: 1,
  },
}));
