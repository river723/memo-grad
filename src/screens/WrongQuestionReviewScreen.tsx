import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Button,
  Divider,
  Surface,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { WrongQuestion, ExamQuestion } from '../types';
import { WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';

export default function WrongQuestionReviewScreen() {
  const navigation = useNavigation();
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadWrongQuestions();
    }, [])
  );

  const loadWrongQuestions = async () => {
    const all = await StorageService.getWrongQuestions();
    // 按最近尝试时间排序
    all.sort((a, b) => new Date(b.last_attempt_at).getTime() - new Date(a.last_attempt_at).getTime());
    setWrongQuestions(all);
  };

  const handleStartReview = () => {
    const questions: ExamQuestion[] = wrongQuestions.map(wq => wq.question);
    navigation.navigate('ExamAnswer' as never, {
      questions,
      questionType: 'review' as any,
    } as never);
  };

  const renderQuestionContent = (wq: WrongQuestion) => {
    const q = wq.question;
    if (q.type === 'definition') {
      return (
        <View>
          <Text style={styles.qSentence}>{q.sentence.replace(/\*/g, '')}</Text>
          <Text style={styles.qWordTag}>目标词: {q.word}</Text>
          <Text style={styles.qCorrectAnswer}>✓ {q.correct_definition}</Text>
          <Text style={styles.qWrongAnswer}>✗ 你的选择: {wq.wrong_answer}</Text>
        </View>
      );
    } else {
      return (
        <View>
          <Text style={styles.qSentence}>{q.sentence.replace('[BLANK]', '______')}</Text>
          {q.chinese_hint ? (
            <Text style={styles.qHint}>💡 {q.chinese_hint}</Text>
          ) : null}
          <Text style={styles.qCorrectAnswer}>✓ {q.correct_answer}</Text>
          <Text style={styles.qWrongAnswer}>✗ 你的选择: {wq.wrong_answer}</Text>
        </View>
      );
    }
  };

  const total = wrongQuestions.length;
  const definitionCount = wrongQuestions.filter(wq => wq.question.type === 'definition').length;
  const clozeCount = wrongQuestions.filter(wq => wq.question.type === 'cloze').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 统计 */}
      <Surface style={styles.statsBar}>
        <Text style={styles.statsText}>错题本 · 共 {total} 题</Text>
        <Text style={styles.statsDetail}>
          释义单选 {definitionCount} · 完形选词 {clozeCount} · 掌握 {WRONG_QUESTION_MASTERY_THRESHOLD} 次后自动移除
        </Text>
      </Surface>

      {total === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>太棒了！没有错题</Text>
          <Text style={styles.emptyHint}>继续保持，多加练习</Text>
          <Button
            mode="outlined"
            onPress={() => navigation.navigate('ExamSetup' as never)}
            style={styles.emptyButton}
          >
            去做一组练习
          </Button>
        </View>
      ) : (
        <>
          {/* 重做按钮 */}
          <Button
            mode="contained"
            onPress={handleStartReview}
            style={styles.reviewButton}
            icon="play-circle"
          >
            重做全部错题（{total} 题）
          </Button>

          {/* 错题列表 */}
          {wrongQuestions.map(wq => (
            <Card key={wq.id} style={styles.reviewCard}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <View style={[styles.typeTag,
                    { backgroundColor: wq.question.type === 'definition' ? '#E3F2FD' : '#FFF3E0' }]}>
                    <Text style={[styles.typeTagText,
                      { color: wq.question.type === 'definition' ? '#1976D2' : '#E65100' }]}>
                      {wq.question.type === 'definition' ? '释义单选' : '完形选词'}
                    </Text>
                  </View>
                  <View style={styles.attemptInfo}>
                    <Text style={styles.attemptText}>
                      错 {wq.wrong_count} 次
                    </Text>
                    {wq.correct_count > 0 && (
                      <Text style={styles.correctCountText}>
                        对 {wq.correct_count}/{WRONG_QUESTION_MASTERY_THRESHOLD}
                      </Text>
                    )}
                  </View>
                </View>
                <Divider style={styles.divider} />
                {renderQuestionContent(wq)}
              </Card.Content>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 40 },
  statsBar: {
    padding: 16, borderRadius: 12, marginBottom: 16, backgroundColor: '#FFF', elevation: 2,
  },
  statsText: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  statsDetail: { fontSize: 12, color: '#888' },
  emptyContainer: { alignItems: 'center', paddingVertical: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#999', marginBottom: 24 },
  emptyButton: { borderRadius: 12 },
  reviewButton: { marginBottom: 16, borderRadius: 12, paddingVertical: 6 },
  reviewCard: { borderRadius: 12, elevation: 2, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeTagText: { fontSize: 11, fontWeight: '600' },
  attemptInfo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  attemptText: { fontSize: 12, color: '#F44336', fontWeight: '500' },
  correctCountText: { fontSize: 12, color: '#4CAF50', fontWeight: '500' },
  divider: { marginVertical: 10, backgroundColor: '#EEE' },
  qSentence: { fontSize: 15, color: '#444', lineHeight: 24, fontStyle: 'italic', marginBottom: 6 },
  qWordTag: { fontSize: 13, color: '#1565C0', fontWeight: '600', marginBottom: 4 },
  qHint: { fontSize: 12, color: '#999', marginBottom: 6 },
  qCorrectAnswer: { fontSize: 14, color: '#2E7D32', fontWeight: '500', marginTop: 4 },
  qWrongAnswer: { fontSize: 14, color: '#C62828', marginTop: 2 },
});
