import React, { useState, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  Chip,
  ActivityIndicator,
  Surface,
  Searchbar,
  SegmentedButtons,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { useAuth } from '../providers/AuthProvider';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { Word, ExamQuestion, ExamQuestionType, DefinitionQuestion, ClozeQuestion } from '../types';
import { getRecommendedWords } from '../utils/examHelpers';
import { EXAM_CONFIG } from '../constants';

/**
 * Fisher–Yates 打乱，返回新数组（不改入参）。
 * AI 出题时倾向把正确答案放在 options[0]，若不打乱会导致正确项恒为 A。
 * 判分按选项内容字符串匹配（option === correct_*），故仅打乱 options 顺序即可，
 * 无需同步移动 correct_answer/correct_definition（它们存内容而非索引）。
 */
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

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

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

      // 聚合每个词的最近学习日期，供"今天到期复习"优先级判断
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
      Alert.alert('生词不足', `需要选够 ${questionCount} 个生词才能出题（当前已选 ${selectedWords.length} 个）`);
      return;
    }
    setIsGenerating(true);
    try {
      const wordData = selectedWords.map(w => ({
        word: w.word,
        meaning: w.definitions.find(d => d.is_core)?.meaning || w.definitions[0]?.meaning || '',
      }));

      // 按单词文本回查原始 Word，避免 AI 返回条数/顺序与入参不一致时 word_id 错配
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
        Alert.alert('出题失败', '未能生成任何题目，请重试');
        setIsGenerating(false);
        return;
      }

      navigation.navigate('ExamAnswer', {
        questions: allQuestions,
        questionType,
      });
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 出题功能需要会员订阅，是否前往订阅页？');
        return;
      }
      Alert.alert('出题失败', error.message || '题目生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredWords = allWords.filter(w =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canStart = selectedWords.length >= questionCount;

  const questionTypeLabel = questionType === 'definition' ? '释义单选' : '完形选词';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 题数调节 */}
      <Surface style={styles.settingsBar}>
        <Text style={styles.settingsText}>
          题型: {questionTypeLabel}
        </Text>
        <View style={styles.countStepper}>
          <Button
            mode="text"
            compact
            onPress={async () => {
              const newCount = Math.max(EXAM_CONFIG.MIN_QUESTION_COUNT, questionCount - 1);
              if (newCount !== questionCount) {
                setQuestionCount(newCount);
                await StorageService.saveSettings({ examQuestionCount: newCount });
                if (selectMode === 'smart') {
                  const recommended = getRecommendedWords(allWords, coverage, wordAccuracy, newCount, lastStudyDate);
                  setSelectedWords(recommended);
                }
              }
            }}
            disabled={questionCount <= EXAM_CONFIG.MIN_QUESTION_COUNT}
            labelStyle={styles.countStepperBtn}
          >
            −
          </Button>
          <Text style={styles.countText}>{questionCount} 题</Text>
          <Button
            mode="text"
            compact
            onPress={async () => {
              const newCount = Math.min(EXAM_CONFIG.MAX_QUESTION_COUNT, questionCount + 1);
              if (newCount !== questionCount) {
                setQuestionCount(newCount);
                await StorageService.saveSettings({ examQuestionCount: newCount });
                if (selectMode === 'smart') {
                  const recommended = getRecommendedWords(allWords, coverage, wordAccuracy, newCount, lastStudyDate);
                  setSelectedWords(recommended);
                }
              }
            }}
            disabled={questionCount >= EXAM_CONFIG.MAX_QUESTION_COUNT}
            labelStyle={styles.countStepperBtn}
          >
            +
          </Button>
        </View>
      </Surface>

      {/* 题型选择 */}
      <Card style={styles.card}>
        <Card.Title title="选择题型" titleStyle={styles.cardTitle} />
        <Card.Content>
          <SegmentedButtons
            value={questionType}
            onValueChange={(val) => setQuestionType(val as ExamQuestionType)}
            buttons={[
              { value: 'definition', label: '释义单选' },
              { value: 'cloze', label: '完形选词' },
            ]}
            style={styles.segmentButtons}
          />
          <Text style={styles.typeHint}>
            {questionType === 'definition'
              ? '给定含有生词的英文句子，选择正确的英文释义（AI 出题）'
              : '给定含空白的句子，选择正确的单词填入（AI 出题）'}
          </Text>
        </Card.Content>
      </Card>

      {/* 选词 */}
      <Card style={styles.card}>
        <Card.Title title="选择生词" titleStyle={styles.cardTitle} />
        <Card.Content>
          <SegmentedButtons
            value={selectMode}
            onValueChange={(val) => {
              setSelectMode(val as 'smart' | 'manual');
              if (val === 'smart') {
                const recommended = getRecommendedWords(allWords, coverage, wordAccuracy, questionCount, lastStudyDate);
                setSelectedWords(recommended);
              }
            }}
            buttons={[
              { value: 'smart', label: '智能推荐' },
              { value: 'manual', label: '手动选择' },
            ]}
            style={styles.segmentButtons}
          />

          {selectMode === 'smart' && (
            <View style={styles.selectedArea}>
              <Text style={styles.sectionLabel}>
                已选 {selectedWords.length}/{questionCount} 个
              </Text>
              {selectedWords.length === 0 && allWords.length > 0 && (
                <Text style={styles.noWordsHint}>
                  单词本中的词都已覆盖 ≥3 次，可切换手动选择
                </Text>
              )}
              <View style={styles.wordGrid}>
                {selectedWords.map(word => (
                  <View key={word.id} style={styles.wordItem}>
                    <Chip
                      style={styles.selectedWordChip}
                      textStyle={styles.wordChipText}
                      onClose={() => replaceWord(word)}
                      closeIcon={({color, size}: any) => (
                        <Text style={{color, fontSize: size, lineHeight: size}}>✕</Text>
                      )}
                    >
                      {word.word}
                    </Chip>
                    <Text
                      style={[styles.coverageBadge, { color: getCoverageColor(word.id) }]}
                    >
                      {getCoverageLabel(word.id)}
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                mode="text"
                onPress={() => {
                  const recommended = getRecommendedWords(allWords, coverage, wordAccuracy, questionCount, lastStudyDate);
                  setSelectedWords(recommended);
                }}
                icon="refresh"
              >
                重新推荐
              </Button>
            </View>
          )}

          {selectMode === 'manual' && (
            <View style={styles.manualArea}>
              <Text style={styles.sectionLabel}>
                已选 {selectedWords.length}/{questionCount} 个
              </Text>
              <Searchbar
                placeholder="搜索单词..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchBar}
                inputStyle={styles.searchInput}
                icon={() => <Text style={{ fontSize: 16 }}>🔍</Text>}
              />
              <View style={styles.wordGrid}>
                {filteredWords.map(word => {
                  const isSelected = selectedWords.some(w => w.id === word.id);
                  return (
                    <TouchableOpacity
                      key={word.id}
                      onPress={() => toggleWordSelection(word)}
                    >
                      <View style={styles.manualWordItem}>
                        <Chip
                          style={[
                            styles.manualWordChip,
                            isSelected && styles.manualWordChipSelected,
                          ]}
                          textStyle={[
                            styles.wordChipText,
                            isSelected && styles.wordChipTextSelected,
                          ]}
                        >
                          {word.word}
                        </Chip>
                        <Text
                          style={[styles.coverageBadge, { color: getCoverageColor(word.id) }]}
                        >
                          {getCoverageLabel(word.id)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* 开始按钮 */}
      <Button
        mode="contained"
        onPress={handleStartExam}
        style={[styles.startButton, !canStart && styles.startButtonDisabled]}
        loading={isGenerating}
        disabled={!canStart || isGenerating}
        icon="play-circle"
      >
        {isGenerating ? '正在出题...' : 'AI出题'}
      </Button>

      {isGenerating && (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>AI 正在为你生成题目...</Text>
          <Text style={styles.loadingHint}>这可能需要 10-30 秒</Text>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  settingsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginBottom: 12,
    backgroundColor: colors.primaryContainer, elevation: 1,
  },
  settingsText: { fontSize: 13, color: colors.primary },
  countStepper: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  countStepperBtn: { fontSize: 18, fontWeight: 'bold' },
  countText: { fontSize: 14, fontWeight: 'bold', color: colors.primary, minWidth: 44, textAlign: 'center' },
  card: { marginBottom: 12, borderRadius: 12, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  segmentButtons: { marginBottom: 12 },
  typeHint: { fontSize: 12, color: colors.tertiary, marginTop: 4, lineHeight: 18 },
  sectionLabel: { fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 10 },
  selectedArea: { marginTop: 4 },
  manualArea: { marginTop: 4 },
  searchBar: { marginBottom: 12, backgroundColor: colors.background, borderRadius: 8, elevation: 0, height: 40 },
  searchInput: { fontSize: 13, minHeight: 0 },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  selectedWordChip: { backgroundColor: colors.primaryContainer },
  wordChipText: { fontSize: 12 },
  wordChipTextSelected: { color: colors.surface },
  coverageBadge: { fontSize: 10, fontWeight: '500', marginLeft: 2 },
  noWordsHint: { fontSize: 13, color: palette.accent, marginBottom: 10 },
  manualWordItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  manualWordChip: { backgroundColor: colors.background },
  manualWordChipSelected: { backgroundColor: colors.primary },
  startButton: { marginTop: 8, paddingVertical: 8, borderRadius: 12 },
  startButtonDisabled: { opacity: 0.5 },
  loadingArea: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { fontSize: 15, color: colors.onSurfaceVariant, marginTop: 16 },
  loadingHint: { fontSize: 12, color: colors.tertiary, marginTop: 4 },
}));
