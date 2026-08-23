import React, { useState, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text, Searchbar, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { Word, Article } from '../types';
import { getRecommendedWords } from '../utils/examHelpers';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import AppButton from '../components/ds/AppButton';
import SectionHeader from '../components/ds/SectionHeader';
import EmptyState from '../components/ds/EmptyState';

interface PreviewSegment {
  text: string;
  isWord: boolean;
}

function parsePreviewContent(content: string, targetWords: string[]): PreviewSegment[] {
  if (!content || targetWords.length === 0) {
    return [{ text: content || '', isWord: false }];
  }
  const escapedWords = targetWords
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
  const segments: PreviewSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.substring(lastIndex, match.index), isWord: false });
    }
    segments.push({ text: match[0], isWord: true });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ text: content.substring(lastIndex), isWord: false });
  }
  return segments;
}

const THEMES = [
  { key: 'random', label: '随机', icon: 'shuffle' as const },
  { key: 'technology', label: '科技', icon: 'devices' as const },
  { key: 'life', label: '生活', icon: 'home' as const },
  { key: 'history', label: '历史', icon: 'history' as const },
  { key: 'nature', label: '自然', icon: 'nature' as const },
  { key: 'science', label: '科学', icon: 'flask' as const },
];

// 步进器（轻量内联组件，避免重复）
function Stepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  onDec,
  onInc,
  colors,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onDec: () => void;
  onInc: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  const t = colors.typography;
  const decDisabled = value <= min;
  const incDisabled = value >= max;
  const stepBtn = (onPress: () => void, disabled: boolean, glyph: string) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          width: 32,
          height: 32,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primaryContainer,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
      <Text style={{ fontSize: t.bodySm.size, color: colors.onSurface }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {stepBtn(onDec, decDisabled, '−')}
        <Text style={{ fontSize: t.body.size, fontWeight: '700', color: colors.primary, minWidth: 56, textAlign: 'center' }}>
          {value} {unit}
        </Text>
        {stepBtn(onInc, incDisabled, '+')}
      </View>
    </View>
  );
}

export default function ArticleGenerateScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const typography = colors.typography;
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [selectedWords, setSelectedWords] = useState<Word[]>([]);
  const [coverage, setCoverage] = useState<Map<string, number>>(new Map());
  const [wordAccuracy, setWordAccuracy] = useState<Map<string, number>>(new Map());
  const [selectMode, setSelectMode] = useState<'smart' | 'manual'>('smart');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('random');
  const [articleWordCount, setArticleWordCount] = useState(10);
  const [articleLength, setArticleLength] = useState(200);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedArticle, setGeneratedArticle] = useState<{ title: string; content: string; translation: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const settings = await StorageService.getSettings();
      setArticleWordCount(settings.articleWordCount || 10);
      setArticleLength(settings.articleLength || 200);

      const words = await StorageService.getWords();
      setAllWords(words);

      const cov = await StorageService.getWordArticleCoverage();
      setCoverage(cov);

      const records = await StorageService.getStudyRecords();
      const accMap = new Map<string, number>();
      for (const word of words) {
        const wordRecords = records.filter(r => r.word_id === word.id);
        if (wordRecords.length === 0) {
          accMap.set(word.id, 1);
        } else {
          const correctCount = wordRecords.filter(r => r.result === 1).length;
          accMap.set(word.id, correctCount / wordRecords.length);
        }
      }
      setWordAccuracy(accMap);

      if (selectMode === 'smart') {
        setSelectedWords(getRecommendedWords(words, cov, accMap, settings.articleWordCount || 10));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const selectRecommended = (count: number) =>
    setSelectedWords(getRecommendedWords(allWords, coverage, wordAccuracy, count));

  const getCoverageLabel = (wordId: string): string => {
    const count = coverage.get(wordId) || 0;
    if (count === 0) return '首次';
    if (count === 1) return '第2次';
    return `第${count + 1}次`;
  };

  const getCoverageColor = (wordId: string): string => {
    const count = coverage.get(wordId) || 0;
    if (count === 0) return colors.success;
    if (count === 1) return colors.warning;
    return colors.tertiary;
  };

  const toggleWordSelection = (word: Word) => {
    setSelectedWords(prev => {
      const exists = prev.find(w => w.id === word.id);
      if (exists) {
        return prev.filter(w => w.id !== word.id);
      } else if (prev.length < articleWordCount) {
        return [...prev, word];
      }
      return prev;
    });
  };

  const replaceWord = (removeWord: Word) => {
    const selectedIds = new Set(selectedWords.map(w => w.id));
    const candidate = allWords.find(w => w.id !== removeWord.id && !selectedIds.has(w.id));
    if (candidate) {
      setSelectedWords(prev => prev.map(w => (w.id === removeWord.id ? candidate : w)));
    } else {
      setSelectedWords(prev => prev.filter(w => w.id !== removeWord.id));
    }
  };

  const handleGenerate = async () => {
    setGenerateError(null);
    if (selectedWords.length < articleWordCount) {
      const msg = `需要选够 ${articleWordCount} 个生词才能生成文章，当前仅 ${selectedWords.length} 个`;
      setGenerateError(msg);
      return;
    }
    setIsGenerating(true);
    setGeneratedArticle(null);
    try {
      const result = await AIService.generateFunArticle(
        selectedWords.map(w => w.word),
        selectedTheme,
        articleLength
      );
      setGeneratedArticle(result);
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 文章生成需要会员订阅，是否前往订阅页？');
        return;
      }
      const msg = error.message || '文章生成失败，请重试';
      setGenerateError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedArticle) return;
    setIsSaving(true);
    try {
      const articleData: Omit<Article, 'id'> = {
        title: generatedArticle.title,
        content: generatedArticle.content,
        translation: generatedArticle.translation,
        words: selectedWords.map(w => w.word),
        word_ids: selectedWords.map(w => w.id),
        theme: selectedTheme,
        created_at: new Date().toISOString(),
        read_count: 0,
      };
      await StorageService.saveArticle(articleData);
      navigation.navigate('ReadHome');
    } catch (error) {
      showConfirm('保存失败', '请重试', { confirmText: '知道了', cancelText: '关闭' }).catch(() => {});
    } finally {
      setIsSaving(false);
    }
  };

  const filteredWords = allWords.filter(w =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 空词库
  if (allWords.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          icon="book-open-page-variant"
          title="生词本为空"
          description="先在学习页添加或从词库选词，再来生成专属阅读文章。"
          actionLabel="去学习"
          onAction={() => navigation.navigate('ReadHome')}
        />
      </View>
    );
  }

  const surface = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderColor: colors.outline,
    borderWidth: 1,
  } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
      {/* Hero + 参数 */}
      <View style={[styles.hero, { backgroundColor: colors.primary, borderRadius: radius.xl }, colors.shadow.card]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: typography.caption.size, letterSpacing: 0.6 }}>
            生成文章
          </Text>
          <Text style={{ color: colors.onPrimary, fontSize: typography.headline.size, lineHeight: typography.headline.lineHeight, fontWeight: '700', letterSpacing: -0.3 }}>
            AI 趣味阅读
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, marginTop: 2 }}>
            用你的生词生成语境短文，加深记忆
          </Text>
        </View>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="creation" size={24} color={colors.onPrimary} />
        </View>
      </View>

      {/* 参数卡 */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="文章参数" icon="tune" compact />
        <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
          <Stepper
            label="每篇生词"
            value={articleWordCount}
            unit="个"
            min={5}
            max={30}
            step={1}
            colors={colors}
            onDec={() => {
              const n = Math.max(5, articleWordCount - 1);
              if (n !== articleWordCount) {
                setArticleWordCount(n);
                if (selectMode === 'smart') selectRecommended(n);
              }
            }}
            onInc={() => {
              const n = Math.min(30, articleWordCount + 1);
              if (n !== articleWordCount) {
                setArticleWordCount(n);
                if (selectMode === 'smart') selectRecommended(n);
              }
            }}
          />
          <View style={{ height: 1, backgroundColor: colors.outline, marginVertical: spacing.xs, opacity: 0.5 }} />
          <Stepper
            label="目标词数"
            value={articleLength}
            unit="词"
            min={100}
            max={1000}
            step={50}
            colors={colors}
            onDec={() => setArticleLength(Math.max(100, articleLength - 50))}
            onInc={() => setArticleLength(Math.min(1000, articleLength + 50))}
          />
        </View>
      </View>

      {/* 选词 */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="选择生词" icon="book-open-variant" compact />
        <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
          <SegmentedButtons
            value={selectMode}
            onValueChange={(val) => {
              setSelectMode(val as 'smart' | 'manual');
              if (val === 'smart') selectRecommended(articleWordCount);
            }}
            buttons={[
              { value: 'smart', label: '智能推荐' },
              { value: 'manual', label: '手动选择' },
            ]}
          />

          <Text style={{ fontSize: typography.bodySm.size, color: colors.onSurfaceVariant, marginTop: spacing.md, marginBottom: spacing.sm }}>
            已选 {selectedWords.length}/{articleWordCount} 个
          </Text>

          {selectMode === 'smart' && (
            <View>
              {selectedWords.length === 0 && (
                <Text style={{ fontSize: typography.bodySm.size, color: colors.warning, marginBottom: spacing.sm }}>
                  单词本中的词都已覆盖 ≥3 次，可切换手动选择
                </Text>
              )}
              <View style={styles.wordGrid}>
                {selectedWords.map(word => (
                  <View key={word.id} style={styles.wordItem}>
                    <View style={styles.selectedWordChip}>
                      <Text style={styles.selectedWordChipText}>{word.word}</Text>
                      <Pressable onPress={() => replaceWord(word)} hitSlop={6} style={styles.chipClose}>
                        <Text style={styles.chipCloseText}>✕</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.coverageBadge, { color: getCoverageColor(word.id) }]}>
                      {getCoverageLabel(word.id)}
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => selectRecommended(articleWordCount)}
                style={({ pressed }) => [styles.textActionRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons name="refresh" size={16} color={colors.primary} />
                <Text style={styles.textActionLabel}>重新推荐</Text>
              </Pressable>
            </View>
          )}

          {selectMode === 'manual' && (
            <View>
              <Searchbar
                placeholder="搜索单词..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.outline }]}
                inputStyle={{ fontSize: typography.bodySm.size, minHeight: 0 }}
                icon={() => <MaterialCommunityIcons name="magnify" size={18} color={colors.tertiary} />}
              />
              <View style={styles.wordGrid}>
                {filteredWords.map(word => {
                  const isSelected = selectedWords.some(w => w.id === word.id);
                  return (
                    <Pressable key={word.id} onPress={() => toggleWordSelection(word)}>
                      <View style={styles.wordItem}>
                        <View style={[styles.manualWordChip, isSelected && { backgroundColor: colors.primary }]}>
                          <Text style={[styles.manualWordChipText, isSelected && { color: colors.onPrimary }]}>
                            {word.word}
                          </Text>
                        </View>
                        <Text style={[styles.coverageBadge, { color: getCoverageColor(word.id) }]}>
                          {getCoverageLabel(word.id)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* 主题 */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="文章主题" icon="palette-outline" compact />
        <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
          <View style={styles.themeGrid}>
            {THEMES.map(theme => {
              const isSelected = selectedTheme === theme.key;
              return (
                <Pressable
                  key={theme.key}
                  onPress={() => setSelectedTheme(theme.key)}
                  style={({ pressed }) => [
                    styles.themeChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surfaceVariant,
                      borderColor: isSelected ? colors.primary : colors.outline,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={theme.icon} size={15} color={isSelected ? colors.onPrimary : colors.onSurfaceVariant} />
                  <Text style={{ fontSize: typography.bodySm.size, fontWeight: '600', color: isSelected ? colors.onPrimary : colors.onSurface }}>
                    {theme.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* 状态提示 */}
      {!generatedArticle && !isGenerating && (selectedWords.length < articleWordCount || generateError) && (
        <View style={{ marginTop: spacing.md, alignItems: 'center' }}>
          {selectedWords.length < articleWordCount && (
            <Text style={{ fontSize: typography.bodySm.size, color: colors.warning, textAlign: 'center', lineHeight: 20 }}>
              ⚠ 已选 {selectedWords.length}/{articleWordCount} 个生词（不足，请切换手动模式或降低生词数）
            </Text>
          )}
          {generateError && (
            <Text style={{ fontSize: typography.bodySm.size, color: colors.danger, textAlign: 'center', marginTop: 4 }}>
              {generateError}
            </Text>
          )}
        </View>
      )}

      {/* 生成按钮 / loading */}
      {!generatedArticle && (
        <View style={{ marginTop: spacing.md }}>
          <AppButton
            title={isGenerating ? '正在生成...' : '生成文章'}
            onPress={handleGenerate}
            variant="primary"
            size="lg"
            fullWidth
            loading={isGenerating}
            disabled={isGenerating}
            leftIcon={<MaterialCommunityIcons name="creation" size={20} color={colors.onPrimary} />}
          />
          {isGenerating && (
            <View style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: 6 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: typography.body.size, color: colors.onSurfaceVariant, marginTop: spacing.sm }}>
                AI 正在为你创作文章...
              </Text>
              <Text style={{ fontSize: typography.caption.size, color: colors.tertiary }}>
                这可能需要 10-30 秒
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 预览 */}
      {generatedArticle && !isGenerating && (
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title="预览" icon="eye-outline" compact />
          <View style={[surface, { padding: spacing.md }, colors.shadow.card]}>
            <Text style={{ fontSize: typography.title.size, fontWeight: '700', color: colors.onSurface, marginBottom: spacing.sm }}>
              {generatedArticle.title}
            </Text>
            <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
              <Text style={styles.previewContent}>
                {parsePreviewContent(generatedArticle.content, selectedWords.map(w => w.word)).map((seg, index) => {
                  if (seg.isWord) {
                    return <Text key={index} style={styles.previewHighlightedWord}>{seg.text}</Text>;
                  }
                  return <Text key={index}>{seg.text}</Text>;
                })}
              </Text>
              {generatedArticle.translation ? (
                <View>
                  <View style={{ height: 1, backgroundColor: colors.outline, marginVertical: spacing.md }} />
                  <Text style={{ fontSize: typography.bodySm.size, fontWeight: '600', color: colors.primary, marginBottom: spacing.sm }}>
                    中文翻译
                  </Text>
                  <Text style={styles.translationContent}>{generatedArticle.translation}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <AppButton
              title="重新生成"
              onPress={handleGenerate}
              variant="secondary"
              size="lg"
              style={{ flex: 1 }}
              leftIcon={<MaterialCommunityIcons name="refresh" size={20} color={colors.primary} />}
            />
            <AppButton
              title="保存文章"
              onPress={handleSave}
              variant="primary"
              size="lg"
              loading={isSaving}
              disabled={isSaving}
              style={{ flex: 1 }}
              leftIcon={<MaterialCommunityIcons name="content-save" size={20} color={colors.onPrimary} />}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 96,
    gap: 12,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 4,
  },
  selectedWordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryContainer,
  },
  selectedWordChipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  chipClose: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCloseText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  coverageBadge: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 2,
  },
  manualWordChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  manualWordChipText: {
    fontSize: 12,
    color: colors.onSurface,
  },
  textActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  textActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  searchBar: {
    borderRadius: radius.md,
    borderWidth: 1,
    elevation: 0,
    height: 40,
    marginBottom: spacing.sm,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  previewContent: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
    lineHeight: 24,
  },
  previewHighlightedWord: {
    color: colors.primary,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
    textDecorationStyle: 'solid',
  },
  translationContent: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
    lineHeight: 26,
  },
}));
