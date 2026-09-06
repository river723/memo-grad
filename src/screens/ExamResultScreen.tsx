import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { ExamQuestion, ExamAnswer as ExamAnswerType, ExamQuestionType, Word, WordDictEntry } from '../types';
import { WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';
import AppButton from '../components/ds/AppButton';
import WordDictModal from '../components/WordDictModal';
import { getLocalWordDictResult, wordDictEntryToWord } from '../utils/wordUtils';

export default function ExamResultScreen() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const navigation = useAppNavigation();
  const route = useAppRoute<'ExamResult'>();
  const questions: ExamQuestion[] = route.params?.questions || [];
  const answers: ExamAnswerType[] = route.params?.answers || [];
  const questionType: ExamQuestionType = route.params?.questionType || 'definition';
  // 套题归属与来源（重做=根记录 id；错题复习='wrong_review'；新生成皆缺省）
  const originId: string | undefined = route.params?.originId;
  const source = route.params?.source ?? 'generation';
  // 用 ref 而非 state 做防重入守卫：persist 是长 async 链，setSaved(true) 要等
  // 一串 await 跑完才置位；React Navigation 在开发模式下会对屏幕双挂载，第二次
  // effect 在两个 await 之间进入时 state 守卫仍是 false，会再存一条一模一样的
  // session。ref 在 effect 函数体顶部同步置位即可堵住重入。
  const savedRef = useRef(false);
  const [hasWrongQuestions, setHasWrongQuestions] = useState(false);
  const [showWordModal, setShowWordModal] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  /** 点击目标词弹释义卡片：优先生词本，缺失回落全局词库（复用错题本模式）。 */
  const handleWordTap = async (wordId: string | undefined, wordText: string) => {
    let word: Word | null = wordId ? await StorageService.getWordById(wordId) : null;
    if (!word) {
      const dict = await getLocalWordDictResult(wordText);
      if (dict) {
        const base = wordDictEntryToWord(wordText, dict as unknown as WordDictEntry);
        word = { ...base, id: `dict-${wordText.toLowerCase()}` } as Word;
      }
    }
    if (word) {
      setSelectedWord(word);
      setShowWordModal(true);
    }
  };

  const total = questions.length;
  const correctCount = answers.filter(a => a.is_correct).length;
  const wrongAnswers = answers.filter(a => !a.is_correct);
  const accuracy = total > 0 ? correctCount / total : 0;
  const accuracyPercent = Math.round(accuracy * 100);

  // 保存 ExamSession + 更新错题本
  useEffect(() => {
    if (savedRef.current || total === 0) return;
    savedRef.current = true;
    const persist = async () => {
      try {
        // 每次作答都插入新行：重做行经 origin_id 归属同一套题，
        // 题库按组聚合最新成绩，练习历史保留每一次记录
        await StorageService.saveExamSession({
          questions,
          answers,
          question_type: questionType,
          accuracy,
          created_at: new Date().toISOString(),
          origin_id: originId ?? null,
          source,
        });
        await StorageService.clearExamDraft();

        let anyWrong = false;
        for (const answer of answers) {
          await StorageService.addOrUpdateWrongQuestion(
            answer.question,
            answer.selected_answer,
            answer.is_correct
          );
          if (!answer.is_correct) anyWrong = true;
        }

        const wrongQs = await StorageService.getWrongQuestions();
        for (const wq of wrongQs) {
          if (wq.correct_count >= WRONG_QUESTION_MASTERY_THRESHOLD) {
            await StorageService.removeWrongQuestion(wq.id);
          }
        }

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
      } catch (error) {
        console.error('Failed to persist exam result:', error);
      }
    };
    persist();
  }, []);

  const getAccuracyColor = (rate: number) => {
    if (rate >= 0.8) return colors.success;
    if (rate >= 0.6) return colors.warning;
    return colors.danger;
  };

  const typeLabel = questionType === 'definition' ? '释义单选' : '完形选词';

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    borderWidth: 1,
  } as const;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
      {/* 总览卡片 */}
      <View style={[surface, { padding: spacing.xl, alignItems: 'center' }, colors.shadow.card]}>
        <Text style={{ fontSize: typography.bodyLg.size, color: colors.onSurfaceVariant, marginBottom: spacing.sm }}>
          练习完成! · {typeLabel}
        </Text>
        <Text style={[{ fontSize: typography.numeralXl.size, lineHeight: typography.numeralXl.lineHeight, fontWeight: '800', marginBottom: spacing.sm }, { color: getAccuracyColor(accuracy) }]}>
          {accuracyPercent}%
        </Text>
        <Text style={{ fontSize: typography.body.size, color: colors.tertiary, textAlign: 'center' }}>
          共 {total} 题，答对 {correctCount} 题，答错 {wrongAnswers.length} 题
          {answers.length < total ? `，未答 ${total - answers.length} 题` : ''}
        </Text>
      </View>

      {/* 逐题回顾 */}
      <Text style={styles.reviewHeader}>答题回顾</Text>
      {questions.map((question, idx) => {
        const answer = answers.find(a => a.question_index === idx);
        const isCorrect = answer?.is_correct ?? false;
        const isAnswered = answer != null;

        return (
          <View key={idx} style={[surface, { padding: spacing.md, marginBottom: spacing.sm }, colors.shadow.hairline]}>
            <View style={styles.reviewHeaderRow}>
              <View style={styles.reviewTagRow}>
                <View style={[styles.reviewTypeTag,
                  { backgroundColor: question.type === 'definition' ? colors.primaryContainer : colors.secondaryContainer }]}>
                  <Text style={[styles.reviewTypeText,
                    { color: question.type === 'definition' ? colors.primary : colors.secondary }]}>
                    {question.type === 'definition' ? '释义单选' : '完形选词'}
                  </Text>
                </View>
                <Text style={styles.reviewNumber}>第 {idx + 1} 题</Text>
              </View>
              {isAnswered ? (
                <Text style={[styles.reviewVerdict, { color: isCorrect ? colors.success : colors.danger }]}>
                  {isCorrect ? '✓ 正确' : '✗ 错误'}
                </Text>
              ) : (
                <Text style={[styles.reviewVerdict, { color: colors.tertiary }]}>未作答</Text>
              )}
            </View>

            <View style={styles.reviewDivider} />

            {question.type === 'definition' ? (
              <View>
                <Text style={styles.reviewSentence}>{question.sentence.replace(/\*/g, '')}</Text>
                {question.chinese_translation ? (
                  <Text style={styles.reviewTranslation}>题干译文：{question.chinese_translation}</Text>
                ) : null}
                <Pressable onPress={() => handleWordTap(question.word_id, question.word)}>
                  <Text style={[styles.reviewWordTag, { textDecorationLine: 'underline' }]}>
                    目标词: {question.word}
                  </Text>
                </Pressable>
                <Text style={styles.reviewCorrectAnswer}>正确答案：{question.correct_definition}</Text>
                {isAnswered && !isCorrect && (
                  <Text style={styles.reviewUserAnswer}>
                    你的选择：{answer!.selected_answer || '（未作答）'}
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
                <Text style={styles.reviewCorrectAnswer}>正确答案：{question.correct_answer}</Text>
                {isAnswered && !isCorrect && (
                  <Text style={styles.reviewUserAnswer}>
                    你的选择：{answer!.selected_answer || '（未作答）'}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* 操作按钮 */}
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <AppButton
          title="再来一组"
          onPress={() => navigation.navigate('ExamSetup')}
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<MaterialCommunityIcons name="refresh" size={20} color={colors.onPrimary} />}
        />
        {hasWrongQuestions && (
          <AppButton
            title="复习错题"
            onPress={() => navigation.navigate('WrongQuestionReview')}
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={<MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.primary} />}
          />
        )}
        <AppButton
          title="返回练习"
          onPress={() => navigation.popToTop()}
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<MaterialCommunityIcons name="arrow-left" size={20} color={colors.primary} />}
        />
        <Pressable onPress={() => navigation.navigate('Main', { screen: 'Home' as any })} style={({ pressed }) => [styles.textBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.textBtnLabel}>返回首页</Text>
        </Pressable>
      </View>
    </ScrollView>
    <WordDictModal
      visible={showWordModal}
      onClose={() => setShowWordModal(false)}
      word={selectedWord}
    />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  reviewHeader: { fontSize: 17, fontWeight: '700', color: colors.onSurface, marginTop: 20, marginBottom: 12 },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewTypeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  reviewTypeText: { fontSize: 11, fontWeight: '600' },
  reviewNumber: { fontSize: 13, color: colors.tertiary },
  reviewVerdict: { fontSize: 14, fontWeight: '700' },
  reviewDivider: { height: 1, backgroundColor: colors.outline, marginVertical: 10, opacity: 0.5 },
  reviewSentence: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 24, fontStyle: 'italic', marginBottom: 6 },
  reviewTranslation: { fontSize: 13, color: colors.primary, lineHeight: 20, marginBottom: 6 },
  reviewWordTag: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 4 },
  reviewHint: { fontSize: 12, color: colors.tertiary, marginBottom: 6 },
  reviewCorrectAnswer: { fontSize: 14, color: colors.success, fontWeight: '500', marginTop: 4 },
  reviewUserAnswer: { fontSize: 14, color: colors.danger, marginTop: 2 },
  textBtn: { paddingVertical: 12, alignItems: 'center' },
  textBtnLabel: { fontSize: 14, fontWeight: '600', color: colors.primary },
}));
