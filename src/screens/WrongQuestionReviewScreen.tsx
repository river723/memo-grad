import React, { useState, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import ReviewOption from '../components/ReviewOption';
import { WrongQuestion, ExamQuestion, ExamQuestionType, RealExamWrongQuestion, RealExamOptionLetter } from '../types';
import { WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import AppButton from '../components/ds/AppButton';
import EmptyState from '../components/ds/EmptyState';

const LETTERS: RealExamOptionLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

type Tab = 'word' | 'real';

export default function WrongQuestionReviewScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [realWrong, setRealWrong] = useState<RealExamWrongQuestion[]>([]);
  const [tab, setTab] = useState<Tab>('word');
  const [typeFilter, setTypeFilter] = useState<'all' | 'definition' | 'cloze'>('all');
  const [wrongCountFilter, setWrongCountFilter] = useState<'all' | 'ge2' | 'ge3'>('all');
  const [explLoading, setExplLoading] = useState<Record<string, boolean>>({});
  const [explOverride, setExplOverride] = useState<Record<string, string>>({});

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

  const filteredWrong = wrongQuestions.filter(wq => {
    if (typeFilter !== 'all' && wq.question.type !== typeFilter) return false;
    if (wrongCountFilter === 'ge2' && wq.wrong_count < 2) return false;
    if (wrongCountFilter === 'ge3' && wq.wrong_count < 3) return false;
    return true;
  });

  const handleStartReview = () => {
    const questions: ExamQuestion[] = filteredWrong.map(wq => wq.question);
    if (questions.length === 0) return;
    const questionType: ExamQuestionType = questions[0]?.type ?? 'definition';
    navigation.navigate('ExamAnswer', { questions, questionType, source: 'wrong_review' });
  };

  const handleOpenPaper = (wq: RealExamWrongQuestion) => {
    if (wq.mode === 'reading') {
      navigation.navigate('RealExamReading', { year: wq.year, setId: wq.setId, passageId: wq.paperId });
    } else if (wq.mode === 'newtype') {
      navigation.navigate('RealExamNewType', { year: wq.year, setId: wq.setId, paperId: wq.paperId });
    } else {
      navigation.navigate('RealExamCloze', { year: wq.year, setId: wq.setId, paperId: wq.paperId });
    }
  };

  const handleRemove = async (questionId: string) => {
    await StorageService.removeRealExamWrongQuestion(questionId);
    loadAll();
  };

  const handleExplain = async (wq: RealExamWrongQuestion) => {
    if (explLoading[wq.questionId]) return;
    setExplLoading(prev => ({ ...prev, [wq.questionId]: true }));
    try {
      const explanation = await AIService.generateRealExamExplanation({
        mode: wq.mode,
        stem: wq.stem,
        blankIndex: wq.blankIndex,
        options: wq.options,
        correctAnswer: wq.correctAnswer,
        userAnswer: wq.userAnswer,
      });
      await StorageService.updateRealExamWrongExplanation(wq.questionId, explanation);
      setExplOverride(prev => ({ ...prev, [wq.questionId]: explanation }));
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 解析功能需要会员订阅，是否前往订阅页？');
        return;
      }
      console.warn('[WrongQuestion] AI 解析失败：', error);
    } finally {
      setExplLoading(prev => ({ ...prev, [wq.questionId]: false }));
    }
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

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    borderWidth: 1,
  } as const;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'word', label: `单词错题 (${wordTotal})` },
          { value: 'real', label: `真题错题 (${realTotal})` },
        ]}
      />

      {tab === 'word' ? (
        <>
          <View style={[surface, { padding: spacing.md, marginTop: spacing.md }, colors.shadow.hairline]}>
            <Text style={{ fontSize: typography.title.size, fontWeight: '700', color: colors.onSurface, marginBottom: 4 }}>
              单词错题 · 共 {wordTotal} 题
            </Text>
            <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant }}>
              释义单选 {wordDef} · 完形选词 {wordCloze} · 掌握 {WRONG_QUESTION_MASTERY_THRESHOLD} 次后自动移除
            </Text>
          </View>

          {wordTotal === 0 ? (
            <EmptyState
              icon="party-popper"
              title="太棒了！没有错题"
              description="继续保持，多做练习巩固。"
              actionLabel="去做一组练习"
              onAction={() => navigation.navigate('ExamSetup')}
            />
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <SegmentedButtons
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter(v as 'all' | 'definition' | 'cloze')}
                  buttons={[
                    { value: 'all', label: '全部' },
                    { value: 'definition', label: '释义' },
                    { value: 'cloze', label: '完形' },
                  ]}
                  style={{ flex: 1 }}
                />
                <SegmentedButtons
                  value={wrongCountFilter}
                  onValueChange={(v) => setWrongCountFilter(v as 'all' | 'ge2' | 'ge3')}
                  buttons={[
                    { value: 'all', label: '不限' },
                    { value: 'ge2', label: '错≥2' },
                    { value: 'ge3', label: '错≥3' },
                  ]}
                  style={{ flex: 1 }}
                />
              </View>

              <View style={{ marginTop: spacing.md }}>
                <AppButton
                  title={`重做（${filteredWrong.length} 题）`}
                  onPress={handleStartReview}
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={filteredWrong.length === 0}
                  leftIcon={<MaterialCommunityIcons name="play-circle" size={20} color={colors.onPrimary} />}
                />
              </View>

              {filteredWrong.map(wq => (
                <View key={wq.id} style={[surface, { padding: spacing.md, marginTop: spacing.sm }, colors.shadow.hairline]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.typeTag, { backgroundColor: wq.question.type === 'definition' ? colors.primaryContainer : colors.secondaryContainer }]}>
                      <Text style={[styles.typeTagText, { color: wq.question.type === 'definition' ? colors.primary : colors.secondary }]}>
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
                  <View style={styles.divider} />
                  {renderWordQuestionContent(wq)}
                </View>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <View style={[surface, { padding: spacing.md, marginTop: spacing.md }, colors.shadow.hairline]}>
            <Text style={{ fontSize: typography.title.size, fontWeight: '700', color: colors.onSurface, marginBottom: 4 }}>
              真题错题 · 共 {realTotal} 题
            </Text>
            <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant }}>
              阅读 {realReading} · 完形 {realClozeCount} · 掌握 {WRONG_QUESTION_MASTERY_THRESHOLD} 次后自动移除
            </Text>
          </View>

          {realTotal === 0 ? (
            <EmptyState
              icon="party-popper"
              title="没有真题错题"
              description="去真题练习做一套试试。"
              actionLabel="去做真题"
              onAction={() => navigation.navigate('RealExamList')}
            />
          ) : (
            realWrong.map(wq => (
              <Pressable
                key={wq.questionId}
                onPress={() => handleOpenPaper(wq)}
                style={({ pressed }) => [
                  surface,
                  { padding: spacing.md, marginTop: spacing.sm, opacity: pressed ? 0.85 : 1 },
                  colors.shadow.hairline,
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.metaRow}>
                    <View style={[styles.typeTag, { backgroundColor: wq.mode === 'reading' ? colors.primaryContainer : colors.secondaryContainer }]}>
                      <Text style={[styles.typeTagText, { color: wq.mode === 'reading' ? colors.primary : colors.secondary }]}>
                        {wq.mode === 'reading' ? '阅读' : wq.mode === 'newtype' ? '新题型' : '完形'}
                      </Text>
                    </View>
                    <Text style={styles.metaText}>
                      {wq.year} · {wq.setId === 'english1' ? '英语一' : '英语二'}
                      {wq.paperTitle ? ` · ${wq.paperTitle}` : ''}
                      {wq.blankIndex != null ? ` · [${wq.blankIndex}]` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleRemove(wq.questionId)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.deleteBtn,
                      { backgroundColor: pressed ? colors.errorContainer : 'transparent' },
                    ]}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={16} color={colors.tertiary} />
                  </Pressable>
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

                {(() => {
                  const expl = explOverride[wq.questionId] ?? wq.explanation;
                  if (expl) {
                    return (
                      <View style={styles.explanationBox}>
                        <Text style={styles.explanationLabel}>解析</Text>
                        <Text style={styles.explanationText}>{expl}</Text>
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      onPress={() => handleExplain(wq)}
                      disabled={!!explLoading[wq.questionId]}
                      style={({ pressed }) => [
                        styles.explainBtn,
                        { borderColor: colors.primary, opacity: explLoading[wq.questionId] ? 0.6 : pressed ? 0.7 : 1 },
                      ]}
                    >
                      {explLoading[wq.questionId] ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <MaterialCommunityIcons name="lightbulb-outline" size={16} color={colors.primary} />
                      )}
                      <Text style={styles.explainBtnText}>
                        {explLoading[wq.questionId] ? '生成中...' : 'AI 解析'}
                      </Text>
                    </Pressable>
                  );
                })()}

                <View style={styles.counters}>
                  <Text style={styles.attemptText}>错 {wq.wrong_count} 次</Text>
                  {wq.correct_count > 0 && (
                    <Text style={styles.correctCountText}>对 {wq.correct_count}/{WRONG_QUESTION_MASTERY_THRESHOLD}</Text>
                  )}
                  <Text style={styles.hintTap}>点击重做本套 →</Text>
                </View>
              </Pressable>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeTagText: { fontSize: 11, fontWeight: '600' },
  attemptInfo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  attemptText: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  correctCountText: { fontSize: 12, color: colors.success, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.outline, marginVertical: 10, opacity: 0.5 },
  qSentence: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 24, fontStyle: 'italic', marginBottom: 6 },
  qWordTag: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 4 },
  qHint: { fontSize: 12, color: colors.tertiary, marginBottom: 6 },
  qCorrectAnswer: { fontSize: 14, color: colors.success, fontWeight: '500', marginTop: 4 },
  qWrongAnswer: { fontSize: 14, color: colors.danger, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  metaText: { fontSize: 12, color: colors.onSurfaceVariant, flexShrink: 1 },
  qStem: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginBottom: 10 },
  explanationBox: { marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: colors.surfaceVariant },
  explanationLabel: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant, marginBottom: 4 },
  explanationText: { fontSize: 13, color: colors.onSurface, lineHeight: 20 },
  explainBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  explainBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  counters: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  hintTap: { fontSize: 11, color: colors.primary, marginLeft: 'auto' },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
}));
