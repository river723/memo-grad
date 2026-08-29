import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import { Article, Word } from '../types';
import { parseArticleContent, buildBilingualPairs } from '../utils/storyUtils';
import { getLocalWordDictResult } from '../utils/wordUtils';
import AppButton from '../components/ds/AppButton';
import WordDictModal from '../components/WordDictModal';

const THEME_LABELS: Record<string, string> = {
  technology: '科技',
  life: '生活',
  history: '历史',
  nature: '自然',
  science: '科学',
  random: '随机',
};

export default function ArticleDetailScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const typography = colors.typography;
  const route = useAppRoute<'ArticleDetail'>();
  const { articleId } = route.params as { articleId: string };

  const [article, setArticle] = useState<Article | null>(null);
  const [wordMap, setWordMap] = useState<Map<string, Word>>(new Map());
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
        navigation.goBack();
        return;
      }
      setArticle(art);

      const allWords = await StorageService.getWords();
      const wMap = new Map<string, Word>();
      for (const wordId of art.word_ids) {
        const word = allWords.find(w => w.id === wordId);
        if (word) {
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

      await StorageService.getSettings();

      const newReadCount = (art.read_count || 0) + 1;
      const now = new Date().toISOString();
      await StorageService.updateArticle(articleId, {
        read_count: newReadCount,
        last_read_at: now,
      });
      setArticle({ ...art, read_count: newReadCount, last_read_at: now });
    } catch (error) {
      console.error('Failed to load article:', error);
    }
  };

  const pairsWithSegs = useMemo(() => {
    if (!article) return [];
    const pairs = buildBilingualPairs(article.content, article.translation);
    return pairs.map(p => ({
      en: p.en,
      zh: p.zh,
      segs: parseArticleContent(p.en, article.words, wordMap),
    }));
  }, [article, wordMap]);

  const handleWordTap = (wordObj?: Word) => {
    if (wordObj) {
      setSelectedWord(wordObj);
      setShowWordModal(true);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      '确认删除',
      '确定要删除这篇文章吗？删除后无法恢复。',
      { confirmText: '删除', cancelText: '取消' }
    ).catch(() => false);
    if (!confirmed) return;
    await StorageService.deleteArticle(articleId);
    navigation.goBack();
  };

  const handleRegenerate = async () => {
    if (!article) {
      return;
    }

    setIsRegenerating(true);
    try {
      const result = await AIService.generateFunArticle(article.words, article.theme, 200);

      await StorageService.updateArticle(article.id, {
        title: result.title,
        content: result.content,
        translation: result.translation,
      });

      await loadArticle();
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 文章生成需要会员订阅，是否前往订阅页？');
        return;
      }
      showConfirm('重新生成失败', error.message || '请重试', {
        confirmText: '知道了',
        cancelText: '关闭',
      }).catch(() => {});
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
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 88 }}>
        {/* Hero：标题 + 主题/已读 */}
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.primary, borderRadius: radius.xl },
            colors.shadow.card,
          ]}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.themePillOnHero}>
                <Text style={styles.themePillOnHeroText}>
                  {THEME_LABELS[article.theme] || article.theme}
                </Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.caption.size }}>
                打开 {article.read_count || 0} 次
              </Text>
            </View>
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
              {article.title}
            </Text>
          </View>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="file-document" size={24} color={colors.onPrimary} />
          </View>
        </View>

        {/* 生词标签 */}
        <View style={styles.wordTagsRow}>
          {article.words.map((word, index) => (
            <View key={index} style={styles.wordTag}>
              <Text style={styles.wordTagText}>{word}</Text>
            </View>
          ))}
        </View>

        {/* 文章正文 */}
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
          {isRegenerating ? (
            <View style={styles.regeneratingArea}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.regeneratingText}>正在重新生成文章...</Text>
            </View>
          ) : (
            <>
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

              {article.translation ? (
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
            </>
          )}
        </View>

        <Text style={styles.tapHint}>
          💡 点击文中<Text style={{ color: colors.primary, fontWeight: '600' }}>蓝色高亮</Text>生词可查看释义
        </Text>
      </ScrollView>

      {/* 底部操作栏 */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.outline }]}>
        <AppButton
          title={isRegenerating ? '生成中...' : '重新生成'}
          onPress={handleRegenerate}
          variant="secondary"
          size="lg"
          loading={isRegenerating}
          disabled={isRegenerating}
          style={{ flex: 1 }}
          leftIcon={<MaterialCommunityIcons name="refresh" size={20} color={colors.primary} />}
        />
        <AppButton
          title="删除"
          onPress={handleDelete}
          variant="danger"
          size="lg"
          style={{ flex: 1 }}
          leftIcon={<MaterialCommunityIcons name="delete-outline" size={20} color={colors.onPrimary} />}
        />
      </View>

      {/* 单词释义弹窗（共享组件） */}
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
    marginBottom: 12,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  themePillOnHero: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  themePillOnHeroText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  wordTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  wordTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.secondaryContainer,
  },
  wordTagText: {
    fontSize: 11,
    color: colors.secondary,
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
  regeneratingArea: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  regeneratingText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginTop: 12,
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
