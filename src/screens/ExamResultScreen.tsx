import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Button,
  Divider,
} from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { ExamQuestion, ExamAnswer as ExamAnswerType, ExamQuestionType } from '../types';
import { WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';

export default function ExamResultScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const questions: ExamQuestion[] = route.params?.questions || [];
  const answers: ExamAnswerType[] = route.params?.answers || [];
  const questionType: ExamQuestionType = route.params?.questionType || 'definition';
  const sessionId: number | undefined = route.params?.sessionId;
  const [saved, setSaved] = useState(false);
  const [hasWrongQuestions, setHasWrongQuestions] = useState(false);

  const total = questions.length;
  const correctCount = answers.filter(a => a.is_correct).length;
  const wrongAnswers = answers.filter(a => !a.is_correct);
  const accuracy = total > 0 ? correctCount / total : 0;
  const accuracyPercent = Math.round(accuracy * 100);

  // 保存 ExamSession + 更新错题本
  useEffect(() => {
    if (saved || total === 0) return;
    const persist = async () => {
      try {
        // 1. 保存本次练习记录（新建或覆盖）
        const sessionData = {
          questions,
          answers,
          question_type: questionType,
          accuracy,
          created_at: new Date().toISOString(),
        };
        if (sessionId !== undefined) {
          await StorageService.updateExamSession(sessionId, sessionData);
        } else {
          await StorageService.saveExamSession(sessionData);
        }

        // 2. 更新错题本
        let anyWrong = false;
        for (const answer of answers) {
          await StorageService.addOrUpdateWrongQuestion(
            answer.question,
            answer.selected_answer,
            answer.is_correct
          );
          if (!answer.is_correct) anyWrong = true;
        }

        // 3. 清理已掌握的错题（correct_count ≥ 3）
        const wrongQs = await StorageService.getWrongQuestions();
        for (const wq of wrongQs) {
          if (wq.correct_count >= WRONG_QUESTION_MASTERY_THRESHOLD) {
            await StorageService.removeWrongQuestion(wq.id!);
          }
        }

        // 4. 保存 StudyRecord（每个答到的单词）
        const today = new Date().toISOString().split('T')[0];
        for (const answer of answers) {
          await StorageService.addStudyRecord({
            word_id: answer.question.word_id,
            study_date: today,
            result: answer.is_correct ? 1 : 0,
            study_mode: 'exam_quiz',
          });
        }

        setHasWrongQuestions(anyWrong);
        setSaved(true);
      } catch (error) {
        console.error('Failed to persist exam result:', error);
      }
    };
    persist();
  }, [saved]);

  const getAccuracyColor = (rate: number) => {
    if (rate >= 0.8) return '#4CAF50';
    if (rate >= 0.6) return '#FF9800';
    return '#F44336';
  };

  const typeLabel = questionType === 'definition' ? '释义单选' : '完形选词';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 总览卡片 */}
      <Card style={styles.summaryCard}>
        <Card.Content style={styles.summaryContent}>
          <Text style={styles.summaryLabel}>练习完成! · {typeLabel}</Text>
          <Text style={[styles.summaryAccuracy, { color: getAccuracyColor(accuracy) }]}>
            {accuracyPercent}%
          </Text>
          <Text style={styles.summaryDetail}>
            共 {total} 题，答对 {correctCount} 题，答错 {wrongAnswers.length} 题
            {answers.length < total ? `，未答 ${total - answers.length} 题` : ''}
          </Text>
        </Card.Content>
      </Card>

      {/* 逐题回顾 */}
      <Text style={styles.reviewHeader}>答题回顾</Text>
      {questions.map((question, idx) => {
        const answer = answers.find(a => a.question_index === idx);
        const isCorrect = answer?.is_correct ?? false;
        const isAnswered = answer != null;

        return (
          <Card key={idx} style={styles.reviewCard}>
            <Card.Content>
              <View style={styles.reviewHeaderRow}>
                <View style={styles.reviewTagRow}>
                  <View style={[styles.reviewTypeTag,
                    { backgroundColor: question.type === 'definition' ? '#E3F2FD' : '#FFF3E0' }]}>
                    <Text style={[styles.reviewTypeText,
                      { color: question.type === 'definition' ? '#1976D2' : '#E65100' }]}>
                      {question.type === 'definition' ? '释义单选' : '完形选词'}
                    </Text>
                  </View>
                  <Text style={styles.reviewNumber}>第 {idx + 1} 题</Text>
                </View>
                {isAnswered ? (
                  <Text style={[styles.reviewVerdict, { color: isCorrect ? '#4CAF50' : '#F44336' }]}>
                    {isCorrect ? '✓ 正确' : '✗ 错误'}
                  </Text>
                ) : (
                  <Text style={[styles.reviewVerdict, { color: '#999' }]}>未作答</Text>
                )}
              </View>

              <Divider style={styles.reviewDivider} />

              {question.type === 'definition' ? (
                <View>
                  <Text style={styles.reviewSentence}>{question.sentence.replace(/\*/g, '')}</Text>
                  <Text style={styles.reviewWordTag}>目标词: {question.word}</Text>
                  <Text style={styles.reviewCorrectAnswer}>
                    正确答案：{question.correct_definition}
                  </Text>
                  {isAnswered && !isCorrect && (
                    <Text style={styles.reviewUserAnswer}>
                      你的选择：{answer!.selected_answer}
                    </Text>
                  )}
                </View>
              ) : (
                <View>
                  <Text style={styles.reviewSentence}>
                    {question.sentence.replace('[BLANK]', '______')}
                  </Text>
                  {question.chinese_hint ? (
                    <Text style={styles.reviewHint}>💡 {question.chinese_hint}</Text>
                  ) : null}
                  <Text style={styles.reviewCorrectAnswer}>
                    正确答案：{question.correct_answer}
                  </Text>
                  {isAnswered && !isCorrect && (
                    <Text style={styles.reviewUserAnswer}>
                      你的选择：{answer!.selected_answer}
                    </Text>
                  )}
                </View>
              )}
            </Card.Content>
          </Card>
        );
      })}

      {/* 操作按钮 */}
      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('ExamSetup' as never)}
          style={styles.actionButton}
          icon="refresh"
        >
          再来一组
        </Button>
        {hasWrongQuestions && (
          <Button
            mode="outlined"
            onPress={() => navigation.navigate('WrongQuestionReview' as never)}
            style={styles.actionButton}
            icon="alert-circle"
          >
            复习错题
          </Button>
        )}
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('单词本' as never)}
          style={styles.actionButton}
          icon="book"
        >
          查看单词
        </Button>
        <Button
          mode="text"
          onPress={() => navigation.navigate('Main' as never)}
        >
          返回首页
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 40 },
  summaryCard: { borderRadius: 16, elevation: 3, marginBottom: 16, backgroundColor: '#FFF' },
  summaryContent: { alignItems: 'center', paddingVertical: 24 },
  summaryLabel: { fontSize: 16, color: '#666', marginBottom: 8 },
  summaryAccuracy: { fontSize: 56, fontWeight: '800', marginBottom: 8 },
  summaryDetail: { fontSize: 14, color: '#888' },
  reviewHeader: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 12 },
  reviewCard: { borderRadius: 12, elevation: 2, marginBottom: 10 },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewTypeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reviewTypeText: { fontSize: 11, fontWeight: '600' },
  reviewNumber: { fontSize: 13, color: '#888' },
  reviewVerdict: { fontSize: 14, fontWeight: '700' },
  reviewDivider: { marginVertical: 10, backgroundColor: '#EEE' },
  reviewSentence: { fontSize: 15, color: '#444', lineHeight: 24, fontStyle: 'italic', marginBottom: 6 },
  reviewWordTag: { fontSize: 13, color: '#1565C0', fontWeight: '600', marginBottom: 4 },
  reviewHint: { fontSize: 12, color: '#999', marginBottom: 6 },
  reviewCorrectAnswer: { fontSize: 14, color: '#2E7D32', fontWeight: '500', marginTop: 4 },
  reviewUserAnswer: { fontSize: 14, color: '#C62828', marginTop: 2 },
  actions: { marginTop: 8, gap: 10 },
  actionButton: { borderRadius: 12, paddingVertical: 4 },
});
