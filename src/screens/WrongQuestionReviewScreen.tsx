import React, { useState, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  Button,
  Divider,
  Surface,
  SegmentedButtons,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import StorageService from '../services/StorageService';
import ReviewOption from '../components/ReviewOption';
import { WrongQuestion, ExamQuestion, ExamQuestionType, RealExamWrongQuestion, RealExamLetter } from '../types';
import { WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { palette } from '../theme/tokens';

const LETTERS: RealExamLetter[] = ['A', 'B', 'C', 'D'];

type Tab = 'word' | 'real';

/**
 * 错题中心：顶部 Tab 切换「单词错题」与「真题错题」，消除原先"单词错题本里嵌套真题入口"的层级。
 * - 单词错题：基于生词本 AI 出题的错题，可"重做全部"（复用 ExamAnswer）。
 * - 真题错题：真题练习中做错的题，点击整卡跳回原卷重做，右上角可手动移除。
 * 两套错题独立存储，做对 N 次（WRONG_QUESTION_MASTERY_THRESHOLD）后自动移除。
 */
export default function WrongQuestionReviewScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [realWrong, setRealWrong] = useState<RealExamWrongQuestion[]>([]);
  const [tab, setTab] = useState<Tab>('word');

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  const loadAll = async () => {
    const [word, real] = await Promise.all([
      StorageService.getWrongQuestions(),
      StorageService.getRealExamWrongQuestions(),
    ]);
    word.sort((a, b) => new Date(b.last_attempt_at).getTime() - new Date(a.last_attempt_at).getTime());
    real.sort((a, b) => new Date(b.last_attempt_at).getTime() - new Date(a.last_attempt_at).getTime());
    setWrongQuestions(word);
    setRealWrong(real);
  };

  const handleStartReview = () => {
    const questions: ExamQuestion[] = wrongQuestions.map(wq => wq.question);
    const questionType: ExamQuestionType = questions[0]?.type ?? 'definition';
    navigation.navigate('ExamAnswer', { questions, questionType });
  };

  const handleOpenPaper = (wq: RealExamWrongQuestion) => {
    if (wq.mode === 'reading') {
      navigation.navigate('RealExamReading', { year: wq.year, setId: wq.setId, passageId: wq.paperId });
    } else {
      navigation.navigate('RealExamCloze', { year: wq.year, setId: wq.setId, paperId: wq.paperId });
    }
  };

  const handleRemove = async (questionId: string) => {
    await StorageService.removeRealExamWrongQuestion(questionId);
    loadAll();
  };

  const renderWordQuestionContent = (wq: WrongQuestion) => {
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
    }
    return (
      <View>
        <Text style={styles.qSentence}>{q.sentence.replace('[BLANK]', '______')}</Text>
        {q.chinese_hint ? <Text style={styles.qHint}>💡 {q.chinese_hint}</Text> : null}
        <Text style={styles.qCorrectAnswer}>✓ {q.correct_answer}</Text>
        <Text style={styles.qWrongAnswer}>✗ 你的选择: {wq.wrong_answer}</Text>
      </View>
    );
  };

  const wordTotal = wrongQuestions.length;
  const wordDef = wrongQuestions.filter(wq => wq.question.type === 'definition').length;
  const wordCloze = wrongQuestions.filter(wq => wq.question.type === 'cloze').length;
  const realTotal = realWrong.length;
  const realReading = realWrong.filter(w => w.mode === 'reading').length;
  const realClozeCount = realWrong.filter(w => w.mode === 'cloze').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'word', label: `单词错题 (${wordTotal})` },
          { value: 'real', label: `真题错题 (${realTotal})` },
        ]}
        style={styles.filter}
      />

      {tab === 'word' ? (
        <>
          <Surface style={styles.statsBar}>
            <Text style={styles.statsText}>单词错题 · 共 {wordTotal} 题</Text>
            <Text style={styles.statsDetail}>
              释义单选 {wordDef} · 完形选词 {wordCloze} · 掌握 {WRONG_QUESTION_MASTERY_THRESHOLD} 次后自动移除
            </Text>
          </Surface>

          {wordTotal === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>太棒了！没有错题</Text>
              <Text style={styles.emptyHint}>继续保持，多加练习</Text>
              <Button mode="outlined" onPress={() => navigation.navigate('ExamSetup')} style={styles.emptyButton}>
                去做一组练习
              </Button>
            </View>
          ) : (
            <>
              <Button mode="contained" onPress={handleStartReview} style={styles.reviewButton} icon="play-circle">
                重做全部错题（{wordTotal} 题）
              </Button>
              {wrongQuestions.map(wq => (
                <Card key={wq.id} style={styles.reviewCard}>
                  <Card.Content>
                    <View style={styles.cardHeader}>
                      <View style={[styles.typeTag, { backgroundColor: wq.question.type === 'definition' ? palette.primaryLight : palette.accentLight }]}>
                        <Text style={[styles.typeTagText, { color: wq.question.type === 'definition' ? colors.primary : palette.accentDark }]}>
                          {wq.question.type === 'definition' ? '释义单选' : '完形选词'}
                        </Text>
                      </View>
                      <View style={styles.attemptInfo}>
                        <Text style={styles.attemptText}>错 {wq.wrong_count} 次</Text>
                        {wq.correct_count > 0 && (
                          <Text style={styles.correctCountText}>对 {wq.correct_count}/{WRONG_QUESTION_MASTERY_THRESHOLD}</Text>
                        )}
                      </View>
                    </View>
                    <Divider style={styles.divider} />
                    {renderWordQuestionContent(wq)}
                  </Card.Content>
                </Card>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <Surface style={styles.statsBar}>
            <Text style={styles.statsText}>真题错题 · 共 {realTotal} 题</Text>
            <Text style={styles.statsDetail}>
              阅读 {realReading} · 完形 {realClozeCount} · 掌握 {WRONG_QUESTION_MASTERY_THRESHOLD} 次后自动移除
            </Text>
          </Surface>

          {realTotal === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>没有真题错题</Text>
              <Text style={styles.emptyHint}>去真题练习那边做一套试试</Text>
              <Button mode="outlined" onPress={() => navigation.navigate('RealExamList')} style={styles.emptyButton}>
                去做真题
              </Button>
            </View>
          ) : (
            realWrong.map(wq => (
              <TouchableOpacity key={wq.questionId} activeOpacity={0.7} onPress={() => handleOpenPaper(wq)}>
                <Card style={styles.reviewCard}>
                  <Card.Content>
                    <View style={styles.cardHeader}>
                      <View style={styles.metaRow}>
                        <View style={[styles.typeTag, { backgroundColor: wq.mode === 'reading' ? palette.primaryLight : palette.accentLight }]}>
                          <Text style={[styles.typeTagText, { color: wq.mode === 'reading' ? colors.primary : palette.accentDark }]}>
                            {wq.mode === 'reading' ? '阅读' : '完形'}
                          </Text>
                        </View>
                        <Text style={styles.metaText}>
                          {wq.year} · {wq.setId === 'english1' ? '英语一' : '英语二'}
                          {wq.paperTitle ? ` · ${wq.paperTitle}` : ''}
                          {wq.blankIndex ? ` · [${wq.blankIndex}]` : ''}
                        </Text>
                      </View>
                      <IconButton icon="delete-outline" size={18} onPress={() => handleRemove(wq.questionId)} accessibilityLabel="移除该错题" />
                    </View>
                    {wq.stem ? <Text style={styles.qStem}>{wq.stem}</Text> : null}
                    {wq.options.map((opt, oIdx) => {
                      const letter = LETTERS[oIdx];
                      return (
                        <ReviewOption
                          key={letter}
                          letter={letter}
                          option={opt}
                          isCorrect={letter === wq.correctAnswer}
                          isSelected={letter === wq.userAnswer}
                        />
                      );
                    })}
                    {wq.explanation ? (
                      <Surface style={styles.explanationBox}>
                        <Text style={styles.explanationLabel}>解析</Text>
                        <Text style={styles.explanationText}>{wq.explanation}</Text>
                      </Surface>
                    ) : null}
                    <View style={styles.counters}>
                      <Text style={styles.attemptText}>错 {wq.wrong_count} 次</Text>
                      {wq.correct_count > 0 && (
                        <Text style={styles.correctCountText}>对 {wq.correct_count}/{WRONG_QUESTION_MASTERY_THRESHOLD}</Text>
                      )}
                      <Text style={styles.hintTap}>点击重做本套 -&gt;</Text>
                    </View>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  filter: { marginBottom: 16 },
  statsBar: { padding: 16, borderRadius: 12, marginBottom: 16, backgroundColor: colors.surface, elevation: 2 },
  statsText: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  statsDetail: { fontSize: 12, color: colors.onSurfaceVariant },
  reviewButton: { marginBottom: 16, borderRadius: 12, paddingVertical: 6 },
  reviewCard: { borderRadius: 12, elevation: 2, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeTagText: { fontSize: 11, fontWeight: '600' },
  attemptInfo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  attemptText: { fontSize: 12, color: palette.danger, fontWeight: '500' },
  correctCountText: { fontSize: 12, color: palette.success, fontWeight: '500' },
  divider: { marginVertical: 10, backgroundColor: colors.outline },
  qSentence: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 24, fontStyle: 'italic', marginBottom: 6 },
  qWordTag: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 4 },
  qHint: { fontSize: 12, color: colors.tertiary, marginBottom: 6 },
  qCorrectAnswer: { fontSize: 14, color: palette.successDark, fontWeight: '500', marginTop: 4 },
  qWrongAnswer: { fontSize: 14, color: palette.dangerDark, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  metaText: { fontSize: 12, color: colors.onSurfaceVariant, flexShrink: 1 },
  qStem: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginBottom: 10 },
  explanationBox: { marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: colors.primaryContainer, elevation: 0 },
  explanationLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  explanationText: { fontSize: 13, color: colors.onSurface, lineHeight: 20 },
  counters: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  hintTap: { fontSize: 11, color: colors.primary, marginLeft: 'auto' },
  emptyContainer: { alignItems: 'center', paddingVertical: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.onSurface, marginBottom: 8 },
  emptyHint: { fontSize: 14, color: colors.tertiary, marginBottom: 24 },
  emptyButton: { borderRadius: 12 },
}));
