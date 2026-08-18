import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import { ExamQuestion, ExamAnswer as ExamAnswerType, DefinitionQuestion, ClozeQuestion } from '../types';
import { EXAM_CONFIG } from '../constants';
import StorageService from '../services/StorageService';

export default function ExamAnswerScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const route = useAppRoute<'ExamAnswer'>();
  const questions: ExamQuestion[] = route.params?.questions || [];

  const routeParams = route.params || {};
  const questionType = routeParams.questionType || 'definition';
  const sessionId = routeParams.sessionId;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<ExamAnswerType[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 草稿 createdAt 透传：mount 从草稿恢复时取草稿原值，新生成时取生成时刻。
  const draftCreatedAtRef = useRef<string>(new Date().toISOString());

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex >= questions.length - 1;
  const correctCount = answers.filter(a => a.is_correct).length;

  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  // 读取"答题自动跳转"设置：关闭后改为手动点"下一题"，给用户充足时间看答案
  useEffect(() => {
    StorageService.getSettings().then(s => setAutoAdvance(s.examAutoAdvance ?? true));
  }, []);

  // 恢复草稿：仅在「本屏题目与草稿同源」时取回 answers/currentIndex。
  // 同源判定用 JSON.stringify 等价——重做历史题路径传入的 questions 与草稿
  // 内容不同，即便长度/题型巧合一致也不会误恢复。
  useEffect(() => {
    (async () => {
      const draft = await StorageService.getExamDraft();
      if (!draft || draft.questions.length !== questions.length || draft.questionType !== questionType) return;
      if (JSON.stringify(draft.questions) !== JSON.stringify(questions)) return;
      draftCreatedAtRef.current = draft.createdAt;
      setAnswers(draft.answers);
      setCurrentIndex(Math.min(Math.max(draft.currentIndex, 0), questions.length - 1));
    })();
  }, []);

  // 落草稿：答一题/跳过/翻页时同步整套题 + 已答答案 + 当前题号。
  const persistDraft = async (nextAnswers: ExamAnswerType[], nextIndex: number) => {
    await StorageService.saveExamDraft({
      questions,
      answers: nextAnswers,
      questionType,
      currentIndex: nextIndex,
      createdAt: draftCreatedAtRef.current,
      version: 1,
    });
  };

  const handleSelect = (option: string) => {
    if (isRevealed) return;

    setSelectedOption(option);
    setIsRevealed(true);

    const correctAnswer = getCorrectAnswer(currentQuestion);
    const isCorrect = option === correctAnswer;

    const newAnswer: ExamAnswerType = {
      question_index: currentIndex,
      question: currentQuestion,
      selected_answer: option,
      is_correct: isCorrect,
    };
    const finalAnswers = [...answers, newAnswer];
    setAnswers(finalAnswers);

    // 自动跳转关闭时，不设定时器，等用户手动点"下一题"。答案已落草稿。
    if (!autoAdvance) {
      persistDraft(finalAnswers, currentIndex);
      return;
    }

    autoAdvanceTimer.current = setTimeout(() => {
      if (isLastQuestion) {
        navigation.navigate('ExamResult', {
          questions,
          answers: finalAnswers,
          questionType,
          sessionId,
        });
      } else {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setSelectedOption(null);
        setIsRevealed(false);
        persistDraft(finalAnswers, nextIndex);
      }
    }, EXAM_CONFIG.AUTO_ADVANCE_DELAY);
  };

  const handleSkip = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    // 跳过的题以"未作答·错误"记入 answers，确保能进错题本与学习记录；
    // 否则跳过的题既不算入结果也不会被复习，形成永久漏洞。
    const alreadyAnswered = answers.some(a => a.question_index === currentIndex);
    const updatedAnswers = alreadyAnswered
      ? answers
      : [
          ...answers,
          {
            question_index: currentIndex,
            question: currentQuestion,
            selected_answer: '',
            is_correct: false,
          } as ExamAnswerType,
        ];
    if (!alreadyAnswered) setAnswers(updatedAnswers);

    if (isLastQuestion) {
      navigation.navigate('ExamResult', {
        questions,
        answers: updatedAnswers,
        questionType,
        sessionId,
      });
    } else {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelectedOption(null);
      setIsRevealed(false);
      persistDraft(updatedAnswers, nextIndex);
    }
  };

  const handleNext = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    if (isLastQuestion) {
      navigation.navigate('ExamResult', {
        questions,
        answers,
        questionType,
        sessionId,
      });
    } else {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelectedOption(null);
      setIsRevealed(false);
      persistDraft(answers, nextIndex);
    }
  };

  if (!currentQuestion || questions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>没有题目</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>
          返回
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Surface style={styles.progressBar}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {questions.length}
          </Text>
          <Text style={styles.accuracyText}>
            正确率: {answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0}%
          </Text>
        </View>
        <ProgressBar
          progress={(currentIndex + 1) / questions.length}
          color={colors.primary}
          style={styles.bar}
        />
      </Surface>

      <ScrollView style={styles.questionArea} contentContainerStyle={styles.questionContent}>
        {currentQuestion.type === 'definition' ? (
          <DefinitionQuestionCard
            question={currentQuestion}
            selectedOption={selectedOption}
            isRevealed={isRevealed}
            onSelect={handleSelect}
          />
        ) : (
          <ClozeQuestionCard
            question={currentQuestion}
            selectedOption={selectedOption}
            isRevealed={isRevealed}
            onSelect={handleSelect}
          />
        )}
      </ScrollView>

      <Surface style={styles.bottomBar}>
        {isRevealed ? (
          <View style={styles.feedbackRow}>
            <Text
              style={[
                styles.feedbackText,
                { color: selectedOption === getCorrectAnswer(currentQuestion) ? colors.success : colors.danger },
              ]}
            >
              {selectedOption === getCorrectAnswer(currentQuestion) ? ' 正确' : ' 错误'}
            </Text>
            <View style={styles.bottomActions}>
              <Button mode="text" onPress={handleSkip} textColor={colors.tertiary}>跳过</Button>
              <Button mode="contained" onPress={handleNext}>
                {isLastQuestion ? '查看结果' : '下一题'}
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.waitingRow}>
            <Text style={styles.waitingText}>请选择一个选项</Text>
            <Button mode="text" onPress={handleSkip} textColor={colors.tertiary}>跳过</Button>
          </View>
        )}
      </Surface>
    </View>
  );
}

// ---- 释义单选卡片 ----
function DefinitionQuestionCard({
  question,
  selectedOption,
  isRevealed,
  onSelect,
}: {
  question: DefinitionQuestion;
  selectedOption: string | null;
  isRevealed: boolean;
  onSelect: (option: string) => void;
}) {
  const styles = useStyles();
  // 解析 *word* 标记
  const sentenceParts = parseWordHighlight(question.sentence, question.word);

  return (
    <Card style={styles.questionCard}>
      <Card.Content>
        <View style={styles.typeTag}>
          <Text style={styles.typeTagText}>释义单选</Text>
        </View>

        {/* 句子（含划线单词） */}
        <Surface style={styles.sentenceBox}>
          <Text style={styles.sentenceText}>
            {sentenceParts.map((part, i) =>
              part.isWord ? (
                <Text key={i} style={styles.underlinedWord}>{part.text}</Text>
              ) : (
                <Text key={i}>{part.text}</Text>
              )
            )}
          </Text>
        </Surface>

        <Text style={styles.promptText}>以下哪个是划线单词的正确英文释义？</Text>

        <View style={styles.optionsGrid}>
          {question.options.map((option, idx) => {
            const isSelected = selectedOption === option;
            const isCorrect = option === question.correct_definition;
            return renderOption(styles, idx, option, isSelected, isCorrect, isRevealed, onSelect);
          })}
        </View>
      </Card.Content>
    </Card>
  );
}

// ---- 完形填空卡片 ----
function ClozeQuestionCard({
  question,
  selectedOption,
  isRevealed,
  onSelect,
}: {
  question: ClozeQuestion;
  selectedOption: string | null;
  isRevealed: boolean;
  onSelect: (option: string) => void;
}) {
  const styles = useStyles();
  const { colors: c } = useAppTheme();
  const sentenceParts = question.sentence.split('[BLANK]');

  return (
    <Card style={styles.questionCard}>
      <Card.Content>
        <View style={styles.typeTag}>
          <Text style={[styles.typeTagText, { color: c.warning }]}>完形选词</Text>
        </View>
        <Surface style={[styles.sentenceBox, { borderLeftColor: c.warning }]}>
          <Text style={styles.sentenceText}>
            {sentenceParts.length === 2 ? (
              <>
                <Text>{sentenceParts[0]}</Text>
                <Text style={styles.blankMarker}>______</Text>
                <Text>{sentenceParts[1]}</Text>
              </>
            ) : (
              question.sentence
            )}
          </Text>
        </Surface>
        <Text style={styles.promptText}>选择正确的单词填入空白处：</Text>
        <View style={styles.optionsGrid}>
          {question.options.map((option, idx) => {
            const isSelected = selectedOption === option;
            const isCorrect = option === question.correct_answer;
            return renderOption(styles, idx, option, isSelected, isCorrect, isRevealed, onSelect);
          })}
        </View>
      </Card.Content>
    </Card>
  );
}

// ---- 共享：选项渲染 ----
function renderOption(
  styles: any,
  idx: number,
  option: string,
  isSelected: boolean,
  isCorrect: boolean,
  isRevealed: boolean,
  onSelect: (option: string) => void
) {
  let optionStyle = styles.optionButton;
  let textStyle = styles.optionText;

  if (isRevealed) {
    if (isCorrect) {
      optionStyle = { ...optionStyle, ...styles.optionCorrect };
      textStyle = { ...textStyle, ...styles.optionTextCorrect };
    } else if (isSelected && !isCorrect) {
      optionStyle = { ...optionStyle, ...styles.optionIncorrect };
      textStyle = { ...textStyle, ...styles.optionTextIncorrect };
    }
  } else if (isSelected) {
    optionStyle = { ...optionStyle, ...styles.optionSelected };
    textStyle = { ...textStyle, ...styles.optionTextSelected };
  }

  return (
    <TouchableOpacity key={idx} onPress={() => onSelect(option)} activeOpacity={0.7}>
      <View style={optionStyle}>
        <Text style={styles.optionIndex}>{'ABCD'[idx]}</Text>
        <Text style={textStyle} numberOfLines={3}>{option}</Text>
        {isRevealed && isCorrect && <Text style={styles.checkIcon}>✓</Text>}
        {isRevealed && isSelected && !isCorrect && <Text style={styles.crossIcon}>✗</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ---- 工具函数 ----
function parseWordHighlight(sentence: string, word: string): { text: string; isWord: boolean }[] {
  // AI 用 *word* 标记，也兼容没有标记的情况
  const parts: { text: string; isWord: boolean }[] = [];
  const regex = /\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: sentence.substring(lastIndex, match.index), isWord: false });
    }
    parts.push({ text: match[1], isWord: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < sentence.length) {
    parts.push({ text: sentence.substring(lastIndex), isWord: false });
  }

  // 如果 AI 没有用 * 标记，退化处理：先精确匹配，再按前缀匹配屈折形式
  // （如目标词 abandon，句子里出现 abandoned/abandoning 也能定位到）
  if (parts.length === 0) {
    const range = findWordRange(sentence, word);
    if (range) {
      if (range.start > 0) parts.push({ text: sentence.substring(0, range.start), isWord: false });
      parts.push({ text: sentence.substring(range.start, range.end), isWord: true });
      if (range.end < sentence.length) {
        parts.push({ text: sentence.substring(range.end), isWord: false });
      }
    } else {
      parts.push({ text: sentence, isWord: false });
    }
  }

  return parts;
}

/**
 * 在句子里定位目标词的字符区间：先精确匹配（词边界），
 * 找不到再按目标词为前缀匹配更长的屈折形式（abandon -> abandoned）。
 * 找不到返回 null。匹配不区分大小写。
 */
function findWordRange(sentence: string, word: string): { start: number; end: number } | null {
  if (!sentence || !word) return null;
  const lower = sentence.toLowerCase();
  const w = word.trim().toLowerCase();
  if (!w) return null;

  const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  const atBoundary = (i: number) => i <= 0 || i >= lower.length || !isWordChar(lower[i]);

  // 1. 精确匹配
  let from = 0;
  let idx: number;
  while ((idx = lower.indexOf(w, from)) >= 0) {
    if (atBoundary(idx) && atBoundary(idx + w.length)) {
      return { start: idx, end: idx + w.length };
    }
    from = idx + 1;
  }

  // 2. 前缀匹配屈折形式：找以目标词开头、后续仍为字母的最长连续串
  if (w.length >= 3) {
    from = 0;
    while ((idx = lower.indexOf(w, from)) >= 0) {
      if (atBoundary(idx)) {
        let end = idx + w.length;
        // 向后延伸常见屈折后缀字母，直到非字母字符
        while (end < lower.length && isWordChar(lower[end])) end++;
        if (end > idx + w.length && atBoundary(end)) {
          return { start: idx, end };
        }
      }
      from = idx + 1;
    }
  }

  return null;
}

function getCorrectAnswer(question: ExamQuestion): string {
  if (question.type === 'definition') {
    return question.correct_definition;
  }
  return question.correct_answer;
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: colors.tertiary, marginBottom: 16 },
  progressBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.outline },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressText: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  accuracyText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  bar: { height: 3, borderRadius: 2, backgroundColor: colors.outline },
  questionArea: { flex: 1 },
  questionContent: { padding: 16, paddingBottom: 32 },
  questionCard: { borderRadius: 12, elevation: 0, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface },
  typeTag: { alignSelf: 'flex-start', backgroundColor: colors.status.active.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 16 },
  typeTagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  promptText: { fontSize: 15, color: colors.onSurfaceVariant, marginBottom: 16, marginTop: 4 },
  sentenceBox: { backgroundColor: colors.background, padding: 16, borderRadius: 8, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: colors.primary },
  sentenceText: { fontSize: 18, color: colors.onSurface, lineHeight: 28, fontFamily: 'SourceSerif4, Georgia, serif' },
  underlinedWord: { color: colors.primary, fontWeight: '700', textDecorationLine: 'underline', textDecorationColor: colors.primary, textDecorationStyle: 'solid' },
  blankMarker: { color: colors.primary, fontWeight: '700', fontSize: 20, textDecorationLine: 'underline' },
  optionsGrid: { gap: 10, marginTop: 4 },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    minHeight: 56,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  optionSelected: { borderColor: colors.primary, borderLeftColor: colors.primary, backgroundColor: colors.primaryContainer },
  optionCorrect: { borderColor: colors.success, borderLeftColor: colors.success, backgroundColor: colors.status.active.bg },
  optionIncorrect: { borderColor: colors.danger, borderLeftColor: colors.danger, backgroundColor: colors.status.refunded.bg },
  optionIndex: { fontSize: 15, fontWeight: '700', color: colors.tertiary, width: 28, textAlign: 'center' },
  optionText: { fontSize: 15, color: colors.onSurface, flex: 1, lineHeight: 22 },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
  optionTextCorrect: { color: colors.success, fontWeight: '600' },
  optionTextIncorrect: { color: colors.danger, fontWeight: '600' },
  checkIcon: { fontSize: 20, color: colors.success, fontWeight: '700', marginLeft: 4 },
  crossIcon: { fontSize: 20, color: colors.danger, fontWeight: '700', marginLeft: 4 },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.outline },
  feedbackRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedbackText: { fontSize: 16, fontWeight: '600' },
  bottomActions: { flexDirection: 'row', gap: 8 },
  waitingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waitingText: { fontSize: 14, color: colors.tertiary },
}));
