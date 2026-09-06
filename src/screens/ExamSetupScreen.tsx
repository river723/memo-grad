import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  ActivityIndicator,
  SegmentedButtons,
  Searchbar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { useAuth } from '../providers/AuthProvider';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import { Word, ExamQuestion, ExamQuestionType, DefinitionQuestion, ClozeQuestion } from '../types';
import { getRecommendedWords } from '../utils/examHelpers';
import { EXAM_CONFIG } from '../constants';
import AppButton from '../components/ds/AppButton';
import SectionHeader from '../components/ds/SectionHeader';

function shuffleOptions<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ExamSetupScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const { isPro } = useAuth();
  const styles = useStyles();
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [selectedWords, setSelectedWords] = useState<Word[]>([]);
  const [coverage, setCoverage] = useState<Map<string, number>>(new Map());
  const [wordAccuracy, setWordAccuracy] = useState<Map<string, number>>(new Map());
  const [lastStudyDate, setLastStudyDate] = useState<Map<string, string>>(new Map());
  const [selectMode, setSelectMode] = useState<'smart' | 'manual'>('smart');
  const [searchQuery, setSearchQuery] = useState('');
  const [questionType, setQuestionType] = useState<ExamQuestionType>('definition');
  const [questionCount, setQuestionCount] = useState(EXAM_CONFIG.DEFAULT_QUESTION_COUNT);
  const [isGenerating, setIsGenerating] = useState(false);
  const resumeCheckingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
      checkResumeDraft();
    }, [])
  );

  // 检测残留的 AI 出题草稿：有则弹「继续答题 / 放弃」。
  const checkResumeDraft = async () => {
    if (resumeCheckingRef.current) return;
    resumeCheckingRef.current = true;
    try {
      const draft = await StorageService.getExamDraft();
      if (!draft || draft.questions.length === 0) return;
      const answered = draft.answers.length;
      const total = draft.questions.length;
      const confirmed = await showConfirm(
        '继续未完成的练习',
        `检测到上次有未完成的${draft.questionType === 'definition' ? '释义单选' : '完形选词'}练习（${answered}/${total} 题），是否继续答题？`,
        { confirmText: '继续答题', cancelText: '放弃' }
      ).catch(() => false);
      if (confirmed) {
        navigation.navigate('ExamAnswer', {
          questions: draft.questions,
          questionType: draft.questionType,
        });
      } else {
        await StorageService.clearExamDraft();
      }
    } finally {
      resumeCheckingRef.current = false;
    }
  };

  const loadData = async () => {
    try {
      const settings = await StorageService.getSettings();
      const count = settings.examQuestionCount || EXAM_CONFIG.DEFAULT_QUESTION_COUNT;
      setQuestionCount(count);

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

      const lastStudyMap = new Map<string, string>();
      for (const r of records) {
        const cur = lastStudyMap.get(r.word_id);
        if (!cur || r.study_date > cur) lastStudyMap.set(r.word_id, r.study_date);
      }
      setLastStudyDate(lastStudyMap);

      if (selectMode === 'smart') {
        const recommended = getRecommendedWords(words, cov, accMap, count, lastStudyMap);
        setSelectedWords(recommended);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

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
      } else if (prev.length < questionCount) {
        return [...prev, word];
      }
      return prev;
    });
  };

  const replaceWord = (removeWord: Word) => {
    const selectedIds = new Set(selectedWords.map(w => w.id));
    const candidate = allWords.find(
      w => w.id !== removeWord.id && !selectedIds.has(w.id)
    );
    if (candidate) {
      setSelectedWords(prev =>
        prev.map(w => (w.id === removeWord.id ? candidate : w))
      );
    } else {
      setSelectedWords(prev => prev.filter(w => w.id !== removeWord.id));
    }
  };

  const handleStartExam = async () => {
    if (!isPro) {
      subscriptionPrompt(navigation, 'AI 出题功能需要会员订阅，是否前往订阅页？');
      return;
    }
    if (selectedWords.length < questionCount) {
      showConfirm(
        '生词不足',
        `需要选够 ${questionCount} 个生词才能出题（当前已选 ${selectedWords.length} 个）`,
        { confirmText: '知道了', cancelText: '关闭' }
      ).catch(() => {});
      return;
    }
    setIsGenerating(true);
    try {
      const wordData = selectedWords.map(w => ({
        word: w.word,
        meaning: w.definitions.find(d => d.is_core)?.meaning || w.definitions[0]?.meaning || '',
      }));

      const wordByText = new Map<string, typeof selectedWords[number]>();
      selectedWords.forEach(w => wordByText.set(w.word.toLowerCase(), w));
      const resolveWord = (targetWord: string, i: number) =>
        wordByText.get((targetWord || '').toLowerCase()) || selectedWords[i] || selectedWords[0];

      let allQuestions: ExamQuestion[] = [];

      if (questionType === 'definition') {
        const results = await AIService.generateDefinitionQuestions(wordData);
        allQuestions = results.map((q, i) => {
          const word = resolveWord(q.target_word, i);
          return {
            type: 'definition' as const,
            word_id: word.id,
            word: q.target_word,
            sentence: q.sentence,
            correct_definition: q.correct_definition,
            options: shuffleOptions(q.options),
            chinese_translation: q.chinese_translation || '',
          } as DefinitionQuestion;
        });
      } else {
        const results = await AIService.generateClozeQuestions(wordData);
        allQuestions = results.map((q, i) => {
          const word = resolveWord(q.target_word, i);
          return {
            type: 'cloze' as const,
            word_id: word.id,
            target_word: q.target_word,
            sentence: q.sentence,
            chinese_hint: q.chinese_hint,
            options: shuffleOptions(q.options),
            correct_answer: q.correct_answer,
          } as ClozeQuestion;
        });
      }

      if (allQuestions.length === 0) {
        showConfirm('出题失败', '未能生成任何题目，请重试', { confirmText: '知道了', cancelText: '关闭' }).catch(() => {});
        setIsGenerating(false);
        return;
      }

      await StorageService.saveExamDraft({
        questions: allQuestions,
        answers: [],
        questionType,
        currentIndex: 0,
        createdAt: new Date().toISOString(),
        version: 1,
      });

      navigation.navigate('ExamAnswer', {
        questions: allQuestions,
        questionType,
      });
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 出题功能需要会员订阅，是否前往订阅页？');
        return;
      }
      showConfirm('出题失败', error.message || '题目生成失败，请重试', { confirmText: '知道了', cancelText: '关闭' }).catch(() => {});
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredWords = allWords.filter(w =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canStart = selectedWords.length >= questionCount;
  const questionTypeLabel = questionType === 'definition' ? '释义单选' : '完形选词';

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    borderWidth: 1,
  } as const;

  // 题数步进器
  const renderCountStepper = () => {
    const decDisabled = questionCount <= EXAM_CONFIG.MIN_QUESTION_COUNT;
    const incDisabled = questionCount >= EXAM_CONFIG.MAX_QUESTION_COUNT;
    const stepBtn = (onPress: () => void, disabled: boolean, glyph: string) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.stepperBtn,
          { backgroundColor: colors.primaryContainer, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.stepperGlyph}>{glyph}</Text>
      </Pressable>
    );
    return (
      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>题数</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {stepBtn(async () => {
            const n = Math.max(EXAM_CONFIG.MIN_QUESTION_COUNT, questionCount - 1);
            if (n !== questionCount) {
              setQuestionCount(n);
              await StorageService.saveSettings({ examQuestionCount: n });
              if (selectMode === 'smart') {
                setSelectedWords(getRecommendedWords(allWords, coverage, wordAccuracy, n, lastStudyDate));
              }
            }
          }, decDisabled, '−')}
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{questionCount}</Text>
          </View>
          {stepBtn(async () => {
            const n = Math.min(EXAM_CONFIG.MAX_QUESTION_COUNT, questionCount + 1);
            if (n !== questionCount) {
              setQuestionCount(n);
              await StorageService.saveSettings({ examQuestionCount: n });
              if (selectMode === 'smart') {
                setSelectedWords(getRecommendedWords(allWords, coverage, wordAccuracy, n, lastStudyDate));
              }
            }
          }, incDisabled, '+')}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
      {/* Hero + 题数 */}
      <View style={[styles.hero, { backgroundColor: colors.primary, borderRadius: radius.xl }, colors.shadow.card]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: typography.caption.size, letterSpacing: 0.6 }}>
            AI 出题练习
          </Text>
          <Text style={{ color: colors.onPrimary, fontSize: typography.headline.size, lineHeight: typography.headline.lineHeight, fontWeight: '700', letterSpacing: -0.3 }}>
            {questionTypeLabel} · {questionCount} 题
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, marginTop: 2 }}>
            {isPro ? '由云端 DeepSeek 根据你的生词出题' : '需订阅解锁 AI 出题'}
          </Text>
        </View>
        {renderCountStepper()}
      </View>

      {/* 题型 */}
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="选择题型" icon="format-list-bulleted" compact />
        <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
          <SegmentedButtons
            value={questionType}
            onValueChange={(val) => setQuestionType(val as ExamQuestionType)}
            buttons={[
              { value: 'definition', label: '释义单选' },
              { value: 'cloze', label: '完形选词' },
            ]}
          />
          <Text style={styles.typeHint}>
            {questionType === 'definition'
              ? '给定含有生词的英文句子，选择正确的英文释义（AI 出题）'
              : '给定含空白的句子，选择正确的单词填入（AI 出题）'}
          </Text>
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
              if (val === 'smart') {
                setSelectedWords(getRecommendedWords(allWords, coverage, wordAccuracy, questionCount, lastStudyDate));
              }
            }}
            buttons={[
              { value: 'smart', label: '智能推荐' },
              { value: 'manual', label: '手动选择' },
            ]}
          />

          <Text style={styles.sectionLabel}>
            已选 {selectedWords.length}/{questionCount} 个
          </Text>

          {selectMode === 'smart' && (
            <View>
              {selectedWords.length === 0 && allWords.length > 0 && (
                <Text style={styles.noWordsHint}>
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
                onPress={() => setSelectedWords(getRecommendedWords(allWords, coverage, wordAccuracy, questionCount, lastStudyDate))}
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

      {/* 开始按钮 */}
      <View style={{ marginTop: spacing.md }}>
        <AppButton
          title={isGenerating ? '正在出题...' : 'AI 出题'}
          onPress={handleStartExam}
          variant="primary"
          size="lg"
          fullWidth
          loading={isGenerating}
          disabled={!canStart || isGenerating}
          leftIcon={<MaterialCommunityIcons name="creation" size={20} color={colors.onPrimary} />}
        />
        {isGenerating && (
          <View style={styles.loadingArea}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>AI 正在为你生成题目...</Text>
            <Text style={styles.loadingHint}>释义单选生成较慢，可能需要 30-90 秒</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 110,
    gap: 12,
  },
  stepperRow: {
    alignItems: 'center',
    gap: 6,
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.6,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  numberBadge: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  typeHint: {
    fontSize: 12,
    color: colors.tertiary,
    marginTop: 10,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 14,
    marginBottom: 10,
  },
  noWordsHint: {
    fontSize: 13,
    color: colors.warning,
    marginBottom: 10,
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
    marginTop: 14,
  },
  textActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  searchBar: {
    borderRadius: 8,
    borderWidth: 1,
    elevation: 0,
    height: 40,
    marginBottom: 10,
  },
  loadingArea: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  loadingText: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
    marginTop: 12,
  },
  loadingHint: {
    fontSize: 12,
    color: colors.tertiary,
  },
}));
