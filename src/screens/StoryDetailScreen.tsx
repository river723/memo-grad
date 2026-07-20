import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import {
  Card,
  Text,
  Button,
  Modal,
  Chip,
  IconButton,
} from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import { parseArticleContent } from '../utils/storyUtils';
import storiesData from '../data/stories.json';
import wordDictData from '../data/worddict.json';
import type { StorySeries, StoryChapter, Word, WordDictJson } from '../types';

const stories = storiesData as StorySeries;
const wordDict = wordDictData as WordDictJson;

/**
 * 将 WordDictEntry 转换为 Word 类型，供释义 Modal 使用。
 * 故事场景下没有真实的 Word.id / 学习记录，用 0 占位。
 */
function dictEntryToWord(wordKey: string): Word | undefined {
  const entry = wordDict.results[wordKey.toLowerCase()];
  if (!entry) return undefined;
  return {
    id: 0,
    word: wordKey,
    definitions: entry.definitions || [],
    etymology: entry.etymology,
    similar_words: entry.similar_words || [],
    memory_tip: entry.memoryTip,
    difficulty: entry.suggestedDifficulty || 3,
    frequency: entry.examFrequency || 3,
  };
}

export default function StoryDetailScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const route = useAppRoute<'StoryDetail'>();
  const { chapterId } = route.params as { chapterId: number };

  const chapter: StoryChapter | undefined = useMemo(
    () => stories.chapters.find((c) => c.id === chapterId),
    [chapterId]
  );

  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [showWordModal, setShowWordModal] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  // 构建目标词的 Word Map
  const wordMap = useMemo(() => {
    const map = new Map<string, Word>();
    if (!chapter) return map;
    for (const w of chapter.words) {
      const wordObj = dictEntryToWord(w);
      if (wordObj) {
        map.set(w.toLowerCase(), wordObj);
      }
    }
    return map;
  }, [chapter]);

  // 解析段落
  const segments = useMemo(
    () => (chapter ? parseArticleContent(chapter.content, chapter.words, wordMap) : []),
    [chapter, wordMap]
  );

  const handleWordTap = useCallback((wordObj?: Word) => {
    if (wordObj) {
      setSelectedWord(wordObj);
      setShowWordModal(true);
    }
  }, []);

  if (!chapter) {
    return (
      <View style={styles.loadingContainer}>
        <Text>章节不存在</Text>
      </View>
    );
  }

  const prevChapter = stories.chapters.find((c) => c.id === chapter.id - 1);
  const nextChapter = stories.chapters.find((c) => c.id === chapter.id + 1);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 章节标题 */}
        <View style={styles.header}>
          <Text style={styles.chapterNum}>第 {chapter.id} 章</Text>
          <Text style={styles.title}>{chapter.title}</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.metaText}>{chapter.word_count} 词</Text>
            <Text style={styles.metaText}>· {chapter.words.length} 个目标词</Text>
          </View>
        </View>

        {/* 正文 */}
        <Card style={styles.contentCard}>
          <Card.Content>
            <Text style={styles.articleText}>
              {segments.map((seg, index) => {
                if (seg.isWord) {
                  return (
                    <Text
                      key={index}
                      style={styles.highlightedWord}
                      onPress={() => handleWordTap(seg.wordObj)}
                    >
                      {seg.text}
                    </Text>
                  );
                }
                return <Text key={index}>{seg.text}</Text>;
              })}
            </Text>

            {chapter.translation ? (
              <View style={styles.translationToggleArea}>
                <Button
                  mode="outlined"
                  compact
                  onPress={() => setShowTranslation(!showTranslation)}
                  icon={showTranslation ? 'eye-off' : 'eye'}
                  labelStyle={styles.translationToggleLabel}
                  style={styles.translationToggleBtn}
                >
                  {showTranslation ? '隐藏译文' : '显示译文'}
                </Button>
              </View>
            ) : null}
            {chapter.translation && showTranslation && (
              <View>
                <View style={styles.translationDivider} />
                <Text style={styles.translationLabel}>中文翻译</Text>
                <Text style={styles.translationContent}>
                  {chapter.translation}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <Text style={styles.tapHint}>
          💡 点击文中<Text style={{ color: colors.primary, fontWeight: '600' }}>蓝色高亮</Text>生词可查看释义
        </Text>
      </ScrollView>

      {/* 底部导航 */}
      <View style={styles.bottomBar}>
        <Button
          mode="outlined"
          onPress={() =>
            prevChapter && navigation.replace('StoryDetail', { chapterId: prevChapter.id })
          }
          disabled={!prevChapter}
          icon="chevron-left"
          style={styles.bottomButton}
        >
          上一章
        </Button>
        <Button
          mode="outlined"
          onPress={() =>
            nextChapter && navigation.replace('StoryDetail', { chapterId: nextChapter.id })
          }
          disabled={!nextChapter}
          icon="chevron-right"
          contentStyle={{ flexDirection: 'row-reverse' }}
          style={styles.bottomButton}
        >
          下一章
        </Button>
      </View>

      {/* 释义 Modal */}
      <Modal
        visible={showWordModal}
        onDismiss={() => setShowWordModal(false)}
        contentContainerStyle={styles.wordModal}
      >
        {selectedWord && (
          <ScrollView>
            <View style={styles.wordModalHeader}>
              <Text style={styles.wordModalTitle}>{selectedWord.word}</Text>
              <IconButton icon="close" size={20} onPress={() => setShowWordModal(false)} />
            </View>

            <View style={styles.definitions}>
              {selectedWord.definitions.map((def, index) => (
                <View key={index} style={styles.defItem}>
                  <View style={styles.defHeader}>
                    <Chip style={styles.posChip} textStyle={styles.posChipText} compact>
                      {def.part_of_speech}
                    </Chip>
                    <Text style={styles.defMeaning}>{def.meaning}</Text>
                    {def.is_core && (
                      <Chip
                        style={styles.coreChip}
                        textStyle={styles.coreChipText}
                        compact
                      >
                        核心
                      </Chip>
                    )}
                    {def.is_rare_sense && (
                      <Chip
                        style={styles.rareChip}
                        textStyle={styles.rareChipText}
                        compact
                      >
                        熟词僻义
                      </Chip>
                    )}
                  </View>
                  {def.example ? (
                    <Text style={styles.defExample}>{def.example}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {selectedWord.etymology ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>词根词缀</Text>
                <Text style={styles.sectionText}>{selectedWord.etymology}</Text>
              </View>
            ) : null}

            {selectedWord.memory_tip ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>记忆口诀</Text>
                <Text style={styles.sectionText}>{selectedWord.memory_tip}</Text>
              </View>
            ) : null}

            {Array.isArray(selectedWord.similar_words) && selectedWord.similar_words.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>易混词提醒</Text>
                {selectedWord.similar_words.map((sw, index) => (
                  <Text key={index} style={styles.sectionText}>
                    · {sw.word}（{sw.relation === 'spelling' ? '形近' : sw.relation === 'meaning' ? '义近' : '同根'}）— {sw.description}
                  </Text>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 16,
  },
  chapterNum: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 8,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: colors.tertiary,
  },
  contentCard: {
    borderRadius: 12,
    elevation: 2,
    marginBottom: 12,
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
  translationToggleBtn: {
    borderColor: colors.primary,
  },
  translationToggleLabel: {
    fontSize: 12,
    color: colors.primary,
  },
  translationDivider: {
    height: 1,
    backgroundColor: colors.outline,
    marginVertical: 16,
  },
  translationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 8,
  },
  translationContent: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
    lineHeight: 26,
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
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  bottomButton: {
    flex: 1,
  },
  wordModal: {
    backgroundColor: colors.surface,
    padding: 20,
    margin: 24,
    borderRadius: 16,
    maxHeight: '70%',
  },
  wordModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wordModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  definitions: {
    marginBottom: 12,
  },
  defItem: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  defHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  posChip: {
    backgroundColor: colors.background,
    height: 22,
  },
  posChipText: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  defMeaning: {
    fontSize: 15,
    color: colors.onSurface,
    fontWeight: '500',
    flex: 1,
  },
  coreChip: {
    backgroundColor: colors.primaryContainer,
    height: 22,
  },
  coreChipText: {
    fontSize: 10,
    color: colors.primary,
  },
  rareChip: {
    backgroundColor: palette.accentLight,
    height: 22,
  },
  rareChipText: {
    fontSize: 10,
    color: palette.accentDark,
  },
  defExample: {
    fontSize: 13,
    color: colors.tertiary,
    fontStyle: 'italic',
    marginTop: 2,
    marginLeft: 4,
    lineHeight: 19,
  },
  sectionBlock: {
    marginBottom: 12,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 2,
  },
}));
