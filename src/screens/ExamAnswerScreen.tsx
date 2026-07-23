import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
} from 'react-native-paper';
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
    setAnswers(prev => [...prev, newAnswer]);

    // 自动跳转关闭时，不设定时器，等用户手动点"下一题"
    if (!autoAdvance) return;

    autoAdvanceTimer.current = setTimeout(() => {
      if (isLastQuestion) {
        const finalAnswers = [...answers, newAnswer];
        navigation.navigate('ExamResult', {
          questions,
          answers: finalAnswers,
          questionType,
          sessionId,
        });
      } else {
        setCurrentIndex(prev => prev + 1);
        setSelectedOption(null);
        setIsRevealed(false);
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
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsRevealed(false);
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
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsRevealed(false);
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
          color="#1976D2"
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
                { color: selectedOption === getCorrectAnswer(currentQuestion) ? '#4CAF50' : '#F44336' },
              ]}
            >
              {selectedOption === getCorrectAnswer(currentQuestion) ? '✓ 正确!' : '✗ 错误'}
            </Text>
            <View style={styles.bottomActions}>
              <Button mode="text" onPress={handleSkip} textColor="#999">跳过</Button>
              <Button mode="contained" onPress={handleNext}>
                {isLastQuestion ? '查看结果' : '下一题'}
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.waitingRow}>
            <Text style={styles.waitingText}>请选择一个选项</Text>
            <Button mode="text" onPress={handleSkip} textColor="#999">跳过</Button>
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
  const sentenceParts = question.sentence.split('[BLANK]');

  return (
    <Card style={styles.questionCard}>
      <Card.Content>
        <View style={styles.typeTag}>
          <Text style={[styles.typeTagText, { color: '#E65100' }]}>完形选词</Text>
        </View>
        <Surface style={[styles.sentenceBox, { borderLeftColor: '#E65100' }]}>
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

  // 如果 AI 没有用 * 标记，退化处理：直接按 word 查找
  if (parts.length === 0) {
    const idx = sentence.toLowerCase().indexOf(word.toLowerCase());
    if (idx >= 0) {
      if (idx > 0) parts.push({ text: sentence.substring(0, idx), isWord: false });
      parts.push({ text: sentence.substring(idx, idx + word.length), isWord: true });
      if (idx + word.length < sentence.length) {
        parts.push({ text: sentence.substring(idx + word.length), isWord: false });
      }
    } else {
      parts.push({ text: sentence, isWord: false });
    }
  }

  return parts;
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
  progressBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.surface, elevation: 2 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressText: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  accuracyText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  bar: { height: 6, borderRadius: 3 },
  questionArea: { flex: 1 },
  questionContent: { padding: 16, paddingBottom: 32 },
  questionCard: { borderRadius: 16, elevation: 3 },
  typeTag: { alignSelf: 'flex-start', backgroundColor: colors.primaryContainer, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 16 },
  typeTagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  promptText: { fontSize: 15, color: colors.onSurfaceVariant, marginBottom: 16, marginTop: 4 },
  sentenceBox: { backgroundColor: colors.background, padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: colors.primary },
  sentenceText: { fontSize: 16, color: colors.onSurface, lineHeight: 26, fontStyle: 'italic' },
  underlinedWord: { color: colors.primary, fontWeight: '800', textDecorationLine: 'underline', textDecorationColor: colors.primary, textDecorationStyle: 'solid' },
  blankMarker: { color: colors.primary, fontWeight: '800', fontSize: 20, textDecorationLine: 'underline' },
  optionsGrid: { gap: 10 },
  optionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline, minHeight: 48 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  optionCorrect: { borderColor: palette.success, backgroundColor: palette.successLight },
  optionIncorrect: { borderColor: palette.danger, backgroundColor: palette.dangerLight },
  optionIndex: { fontSize: 15, fontWeight: '700', color: colors.tertiary, width: 28, textAlign: 'center' },
  optionText: { fontSize: 15, color: colors.onSurface, flex: 1 },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
  optionTextCorrect: { color: palette.successDark, fontWeight: '600' },
  optionTextIncorrect: { color: palette.dangerDark },
  checkIcon: { fontSize: 20, color: palette.success, fontWeight: '800', marginLeft: 4 },
  crossIcon: { fontSize: 20, color: palette.danger, fontWeight: '800', marginLeft: 4 },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, elevation: 4 },
  feedbackRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedbackText: { fontSize: 17, fontWeight: '700' },
  bottomActions: { flexDirection: 'row', gap: 8 },
  waitingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waitingText: { fontSize: 14, color: colors.tertiary },
}));
