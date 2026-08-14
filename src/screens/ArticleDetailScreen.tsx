import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Card,
  Text,
  Button,
  Modal,
  Chip,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { Article, Word } from '../types';
import { parseArticleContent, TextSegment } from '../utils/storyUtils';
import { getLocalWordDictResult } from '../utils/wordUtils';

const THEME_LABELS: Record<string, string> = {
  technology: '科技',
  life: '生活',
  history: '历史',
  nature: '自然',
  science: '科学',
  random: '随机',
};

// TextSegment / parseArticleContent 已移至 src/utils/storyUtils.ts 供 StoryDetailScreen 复用

export default function ArticleDetailScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const route = useAppRoute<'ArticleDetail'>();
  const { articleId } = route.params as { articleId: string };

  const [article, setArticle] = useState<Article | null>(null);
  const [wordMap, setWordMap] = useState<Map<string, Word>>(new Map());
  const [segments, setSegments] = useState<TextSegment[]>([]);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [showWordModal, setShowWordModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadArticle();
    }, [articleId])
  );

  const loadArticle = async () => {
    try {
      const art = await StorageService.getArticleById(articleId);
      if (!art) {
        Alert.alert('错误', '文章不存在');
        navigation.goBack();
        return;
      }
      setArticle(art);

      // 加载相关单词的完整信息
      const allWords = await StorageService.getWords();
      const wMap = new Map<string, Word>();
      for (const wordId of art.word_ids) {
        const word = allWords.find(w => w.id === wordId);
        if (word) {
          // 生词本存的记录可能缺少记忆技巧等字段，用本地词库回填
          const dict = await getLocalWordDictResult(word.word);
          const enriched: Word = dict
            ? {
                ...word,
                memory_tip: word.memory_tip || dict.memoryTip,
                etymology: word.etymology || dict.etymology,
                similar_words:
                  Array.isArray(word.similar_words) && word.similar_words.length > 0
                    ? word.similar_words
                    : dict.similar_words || [],
              }
            : word;
          wMap.set(word.word.toLowerCase(), enriched);
        }
      }
      setWordMap(wMap);

      // 解析文章内容
      const segs = parseArticleContent(art.content, art.words, wMap);
      setSegments(segs);

      // 加载设置，触发旧数据迁移
      await StorageService.getSettings();

      // 更新已读次数
      await StorageService.updateArticle(articleId, {
        read_count: (art.read_count || 0) + 1,
        last_read_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load article:', error);
    }
  };

  const handleWordTap = (wordObj?: Word) => {
    if (wordObj) {
      setSelectedWord(wordObj);
      setShowWordModal(true);
    }
  };

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这篇文章吗？删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await StorageService.deleteArticle(articleId);
          navigation.goBack();
        },
      },
    ]);
  };

  const handleRegenerate = async () => {
    if (!article) {
      return;
    }

    setIsRegenerating(true);
    try {
      const result = await AIService.generateFunArticle(
        article.words,
        article.theme,
        200
      );

      // 更新当前文章内容
      await StorageService.updateArticle(article.id, {
        title: result.title,
        content: result.content,
        translation: result.translation,
      });

      // 重新加载
      await loadArticle();
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 文章生成需要会员订阅，是否前往订阅页？');
        return;
      }
      Alert.alert('重新生成失败', error.message || '请重试');
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!article) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 文章头部 */}
        <View style={styles.header}>
          <Text style={styles.title}>{article.title}</Text>
          <View style={styles.headerMeta}>
            <Chip icon="tag" style={styles.themeChip} textStyle={styles.themeChipText}>
              {THEME_LABELS[article.theme] || article.theme}
            </Chip>
            <Text style={styles.metaText}>
              已读 {article.read_count || 0} 次
            </Text>
          </View>
          {/* 生词标签 */}
          <View style={styles.wordTags}>
            {article.words.map((word, index) => (
              <Chip
                key={index}
                style={styles.wordTag}
                textStyle={styles.wordTagText}
                compact
              >
                {word}
              </Chip>
            ))}
          </View>
        </View>

        {/* 文章正文 - 带生词高亮 */}
        <Card style={styles.contentCard}>
          <Card.Content>
            {isRegenerating ? (
              <View style={styles.regeneratingArea}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.regeneratingText}>正在重新生成文章...</Text>
              </View>
            ) : (
              <>
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
                {article.translation ? (
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
                {article.translation && showTranslation && (
                  <View>
                    <View style={styles.translationDivider} />
                    <Text style={styles.translationLabel}>中文翻译</Text>
                    <Text style={styles.translationContent}>
                      {article.translation}
                    </Text>
                  </View>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* 底部提示 */}
        <Text style={styles.tapHint}>
          💡 点击文中<Text style={{ color: colors.primary, fontWeight: '600' }}>蓝色高亮</Text>生词可查看释义
        </Text>
      </ScrollView>

      {/* 底部操作栏 */}
      <View style={styles.bottomBar}>
        <Button
          mode="outlined"
          onPress={handleRegenerate}
          loading={isRegenerating}
          disabled={isRegenerating}
          icon="refresh"
          style={styles.bottomButton}
        >
          重新生成
        </Button>
        <Button
          mode="outlined"
          onPress={handleDelete}
          icon="delete-outline"
          style={styles.bottomButton}
          textColor={colors.danger}
        >
          删除
        </Button>
      </View>

      {/* 单词释义弹窗 */}
      <Modal
        visible={showWordModal}
        onDismiss={() => setShowWordModal(false)}
        contentContainerStyle={styles.wordModal}
      >
        {selectedWord && (
          <View>
            <View style={styles.wordModalHeader}>
              <Text style={styles.wordModalTitle}>{selectedWord.word}</Text>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setShowWordModal(false)}
              />
            </View>

            {selectedWord.pronunciation_uk && (
              <Text style={styles.pronunciation}>
                英 /{selectedWord.pronunciation_uk}/
                {selectedWord.pronunciation_us &&
                  `  美 /${selectedWord.pronunciation_us}/`}
              </Text>
            )}

            {/* 释义列表 */}
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

            {/* 词根词缀 */}
            {selectedWord.etymology ? (
              <View style={styles.etymologySection}>
                <Text style={styles.sectionLabel}>词根词缀</Text>
                <Text style={styles.etymologyText}>{selectedWord.etymology}</Text>
              </View>
            ) : null}

            {/* 记忆口诀 */}
            {selectedWord.memory_tip ? (
              <View style={styles.etymologySection}>
                <Text style={styles.sectionLabel}>记忆口诀</Text>
                <Text style={styles.etymologyText}>{selectedWord.memory_tip}</Text>
              </View>
            ) : null}

            {/* 相似词 */}
            {Array.isArray(selectedWord.similar_words) && selectedWord.similar_words.length > 0 && (
              <View style={styles.similarSection}>
                <Text style={styles.sectionLabel}>易混词提醒</Text>
                {selectedWord.similar_words.map((sw, index) => (
                  <Text key={index} style={styles.similarText}>
                    · {sw.word}（{sw.relation === 'spelling' ? '形近' : sw.relation === 'meaning' ? '义近' : '同根'}）— {sw.description}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </Modal>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 10,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  themeChip: {
    backgroundColor: colors.primaryContainer,
    height: 28,
  },
  themeChipText: {
    fontSize: 11,
    color: colors.primary,
  },
  metaText: {
    fontSize: 12,
    color: colors.tertiary,
  },
  wordTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordTag: {
    backgroundColor: palette.accentLight,
    height: 26,
  },
  wordTagText: {
    fontSize: 11,
    color: palette.accentDark,
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
  regeneratingArea: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  regeneratingText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginTop: 12,
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
  pronunciation: {
    fontSize: 13,
    color: colors.tertiary,
    marginBottom: 16,
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
  etymologySection: {
    marginBottom: 12,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  etymologyText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
  similarSection: {
    marginBottom: 4,
  },
  similarText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 2,
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
}));
