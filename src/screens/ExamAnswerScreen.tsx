import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
} from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ExamQuestion, ExamAnswer as ExamAnswerType, DefinitionQuestion, ClozeQuestion } from '../types';
import { EXAM_CONFIG } from '../constants';

export default function ExamAnswerScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const questions: ExamQuestion[] = route.params?.questions || [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<ExamAnswerType[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex >= questions.length - 1;
  const correctCount = answers.filter(a => a.is_correct).length;

  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
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

    autoAdvanceTimer.current = setTimeout(() => {
      if (isLastQuestion) {
        const finalAnswers = [...answers, newAnswer];
        navigation.navigate('ExamResult' as never, {
          questions,
          answers: finalAnswers,
          questionType: route.params?.questionType,
          sessionId: route.params?.sessionId,
        } as never);
      } else {
        setCurrentIndex(prev => prev + 1);
        setSelectedOption(null);
        setIsRevealed(false);
      }
    }, EXAM_CONFIG.AUTO_ADVANCE_DELAY);
  };

  const handleSkip = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    if (isLastQuestion) {
      navigation.navigate('ExamResult' as never, {
        questions,
        answers,
        questionType: route.params?.questionType,
        sessionId: route.params?.sessionId,
      } as never);
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsRevealed(false);
    }
  };

  const handleNext = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    if (isLastQuestion) {
      navigation.navigate('ExamResult' as never, {
        questions,
        answers,
        questionType: route.params?.questionType,
        sessionId: route.params?.sessionId,
      } as never);
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
            return renderOption(idx, option, isSelected, isCorrect, isRevealed, onSelect);
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
        {question.chinese_hint ? (
          <Text style={styles.chineseHint}>💡 {question.chinese_hint}</Text>
        ) : null}
        <Text style={styles.promptText}>选择正确的单词填入空白处：</Text>
        <View style={styles.optionsGrid}>
          {question.options.map((option, idx) => {
            const isSelected = selectedOption === option;
            const isCorrect = option === question.correct_answer;
            return renderOption(idx, option, isSelected, isCorrect, isRevealed, onSelect);
          })}
        </View>
      </Card.Content>
    </Card>
  );
}

// ---- 共享：选项渲染 ----
function renderOption(
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: '#999', marginBottom: 16 },
  progressBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFF', elevation: 2 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressText: { fontSize: 14, fontWeight: '600', color: '#333' },
  accuracyText: { fontSize: 13, color: '#1976D2', fontWeight: '500' },
  bar: { height: 6, borderRadius: 3 },
  questionArea: { flex: 1 },
  questionContent: { padding: 16, paddingBottom: 32 },
  questionCard: { borderRadius: 16, elevation: 3 },
  typeTag: { alignSelf: 'flex-start', backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 16 },
  typeTagText: { fontSize: 12, color: '#1976D2', fontWeight: '600' },
  promptText: { fontSize: 15, color: '#555', marginBottom: 16, marginTop: 4 },
  sentenceBox: { backgroundColor: '#FAFAFA', padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#1976D2' },
  sentenceText: { fontSize: 16, color: '#333', lineHeight: 26, fontStyle: 'italic' },
  underlinedWord: { color: '#1565C0', fontWeight: '800', textDecorationLine: 'underline', textDecorationColor: '#1565C0', textDecorationStyle: 'solid' },
  blankMarker: { color: '#1976D2', fontWeight: '800', fontSize: 20, textDecorationLine: 'underline' },
  chineseHint: { fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 20 },
  optionsGrid: { gap: 10 },
  optionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E0E0E0', minHeight: 48 },
  optionSelected: { borderColor: '#1976D2', backgroundColor: '#E3F2FD' },
  optionCorrect: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  optionIncorrect: { borderColor: '#F44336', backgroundColor: '#FFEBEE' },
  optionIndex: { fontSize: 15, fontWeight: '700', color: '#999', width: 28, textAlign: 'center' },
  optionText: { fontSize: 15, color: '#333', flex: 1 },
  optionTextSelected: { color: '#1565C0', fontWeight: '600' },
  optionTextCorrect: { color: '#2E7D32', fontWeight: '600' },
  optionTextIncorrect: { color: '#C62828' },
  checkIcon: { fontSize: 20, color: '#4CAF50', fontWeight: '800', marginLeft: 4 },
  crossIcon: { fontSize: 20, color: '#F44336', fontWeight: '800', marginLeft: 4 },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', elevation: 4 },
  feedbackRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedbackText: { fontSize: 17, fontWeight: '700' },
  bottomActions: { flexDirection: 'row', gap: 8 },
  waitingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waitingText: { fontSize: 14, color: '#999' },
});
