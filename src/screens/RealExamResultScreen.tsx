import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, BackHandler, Pressable } from 'react-native';
import { Card, Text, Button, Surface } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import StorageService from '../services/StorageService';
import ReviewOption from '../components/ReviewOption';
import type {
  RealExamSession,
  RealExamReadingPassage,
  RealExamClozePaper,
  RealExamLetter,
  PassageParagraph,
} from '../types';

const LETTERS: RealExamLetter[] = ['A', 'B', 'C', 'D'];

type RouteParams = {
  session: RealExamSession;
  passage?: RealExamReadingPassage;   // reading 模式带
  paper?: RealExamClozePaper;         // cloze 模式带
  setId?: 'english1' | 'english2';    // 英语一/英语二标识
  archived?: boolean;                 // 从练习历史打开的归档回顾
};

/**
 * 真题结果屏：显示得分、逐题回顾。
 * - 挂载时把 session 存到 AsyncStorage（saveRealExamSession），并写一条 StudyRecord。
 * - 同步把本次错题 upsert 到"真题错题本"（独立于单词错题本），做对时递增 correct_count，
 *   达到 WRONG_QUESTION_MASTERY_THRESHOLD 后自动移除。
 * - 拦截安卓返回键，避免用户从结果屏回到答题屏造成疑惑；改为返回列表。
 */
export default function RealExamResultScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamResult'>();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const savedRef = useRef(false);

  const { session, passage, paper, setId, archived } = (route.params || {}) as RouteParams;

  useEffect(() => {
    // archived（历史归档回顾）不重复落库，也不重算错题本
    if (savedRef.current || !session || archived) return;
    savedRef.current = true;
    (async () => {
      try {
        await StorageService.saveRealExamSession(session);
        // 真题不写 StudyRecord：真题不绑定单词（word_id=0），若写入会污染
        // getStudyRecordsByDate / getWeeklyStudyTrend 等按记录数统计的指标
        // （今日学习数、今日正确率、一周趋势）。真题统计改由 RealExamSession 独立承载。
        // 把错题写入真题错题本（对的题若已在本中则递增 correct_count，掌握后自动移除）
        if (setId) {
          await StorageService.addOrUpdateRealExamWrongQuestions(
            session,
            session.mode === 'reading' ? passage : paper,
            setId,
          );
        }
      } catch (err) {
        console.error('保存真题练习记录失败:', err);
      }
    })();
  }, [session]);

  // 拦截 Android 硬件返回
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackToList();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBackToList = () => {
    // 归档回顾从练习历史进入，返回应回到历史页而非真题列表
    if (archived) {
      navigation.goBack();
      return;
    }
    navigation.navigate('RealExamList');
  };

  const handleRetry = () => {
    const sid = setId ?? 'english1';
    if (session.mode === 'reading' && passage) {
      navigation.replace('RealExamReading', { year: session.year, setId: sid, passageId: passage.id });
    } else if (session.mode === 'cloze' && paper) {
      navigation.replace('RealExamCloze', { year: session.year, setId: sid, paperId: paper.id });
    } else {
      handleBackToList();
    }
  };

  if (!session) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>结果数据丢失</Text>
        <Button mode="contained" onPress={handleBackToList}>返回列表</Button>
      </View>
    );
  }

  const accuracy = session.total > 0 ? session.score / session.total : 0;
  const percentage = Math.round(accuracy * 100);
  const isReading = session.mode === 'reading';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 总分卡 */}
        <Card style={styles.scoreCard}>
          <Card.Content style={styles.scoreContent}>
            <Text style={styles.scoreLabel}>
              {session.year} · {isReading ? '阅读理解' : '完形填空'}
            </Text>
            <Text
              style={[
                styles.scoreNumber,
                { color: percentage >= 60 ? colors.success : colors.danger },
              ]}
            >
              {session.score} / {session.total}
            </Text>
            <Text style={styles.scorePercent}>正确率 {percentage}%</Text>
          </Card.Content>
        </Card>

        {/* 原文与译文：阅读=文章原文；完形=完形原文（含 [N] 占位）。默认展开，可收起。 */}
        <BilingualCard
          paragraphs={isReading ? passage?.paragraphs : paper?.paragraphs}
          mode={isReading ? 'reading' : 'cloze'}
        />

        {/* 逐题回顾 */}
        <Text style={styles.reviewTitle}>逐题回顾</Text>
        {isReading && passage
          ? renderReadingReview(styles, session, passage)
          : paper
            ? renderClozeReview(styles, session, paper)
            : null}

        <View style={styles.footerActions}>
          <Button mode="outlined" onPress={handleBackToList} style={styles.footerButton}>
            返回列表
          </Button>
          <Button mode="contained" onPress={handleRetry} style={styles.footerButton} icon="restart">
            再练一次
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

function BilingualCard({
  paragraphs,
  mode,
}: {
  paragraphs?: PassageParagraph[];
  mode: 'reading' | 'cloze';
}) {
  const styles = useStyles();
  // 默认展开——用户明确要求原文+翻译在结果页显式呈现
  const [expanded, setExpanded] = useState(true);
  if (!paragraphs || paragraphs.length === 0) return null;
  const title = mode === 'reading' ? '📖 文章原文 & 中文译文' : '📖 完形原文 & 中文译文';
  return (
    <Card style={styles.bilingualCard}>
      <Pressable
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? '收起原文与译文' : '展开原文与译文'}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <View style={styles.bilingualHeader}>
          <Text style={styles.bilingualTitle}>{title}（{paragraphs.length} 段）</Text>
          <Text style={styles.bilingualToggle}>{expanded ? '收起 ▲' : '展开 ▼'}</Text>
        </View>
      </Pressable>
      {expanded ? (
        <Card.Content style={styles.bilingualBody}>
          {paragraphs.map((p, i) => (
            <View key={i} style={styles.bilingualPara}>
              <Text style={styles.bilingualParaIndex}>§{i + 1}</Text>
              <Text style={styles.bilingualEn}>{p.en}</Text>
              <Text style={styles.bilingualZh}>{p.zh}</Text>
            </View>
          ))}
        </Card.Content>
      ) : null}
    </Card>
  );
}

function renderReadingReview(
  styles: any,
  session: RealExamSession,
  passage: RealExamReadingPassage,
) {
  return passage.questions.map((q, idx) => {
    const answer = session.answers.find(a => a.questionId === q.id);
    const selected = answer?.selected ?? null;
    const correct = answer?.correct ?? false;
    return (
      <Card key={q.id} style={styles.reviewCard}>
        <Card.Content>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewIndex}>Q{idx + 1}</Text>
            <ResultBadge correct={correct} answered={selected !== null} />
          </View>
          <Text style={styles.reviewStem}>{q.stem}</Text>
          {q.options.map((opt, oIdx) => {
            const letter = LETTERS[oIdx];
            return (
              <ReviewOption
                key={letter}
                letter={letter}
                option={opt}
                isCorrect={letter === q.answer}
                isSelected={letter === selected}
              />
            );
          })}
          {q.explanation ? (
            <Surface style={styles.explanationBox}>
              <Text style={styles.explanationLabel}>解析</Text>
              <Text style={styles.explanationText}>{q.explanation}</Text>
            </Surface>
          ) : null}
        </Card.Content>
      </Card>
    );
  });
}

function renderClozeReview(
  styles: any,
  session: RealExamSession,
  paper: RealExamClozePaper,
) {
  return paper.blanks.map(b => {
    const qid = `${paper.id}-b${b.index}`;
    const answer = session.answers.find(a => a.questionId === qid);
    const selected = answer?.selected ?? null;
    const correct = answer?.correct ?? false;
    return (
      <Card key={b.index} style={styles.reviewCard}>
        <Card.Content>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewIndex}>[{b.index}]</Text>
            <ResultBadge correct={correct} answered={selected !== null} />
          </View>
          {b.options.map((opt, oIdx) => {
            const letter = LETTERS[oIdx];
            return (
              <ReviewOption
                key={letter}
                letter={letter}
                option={opt}
                isCorrect={letter === b.answer}
                isSelected={letter === selected}
              />
            );
          })}
          {b.explanation ? (
            <Surface style={styles.explanationBox}>
              <Text style={styles.explanationLabel}>解析</Text>
              <Text style={styles.explanationText}>{b.explanation}</Text>
            </Surface>
          ) : null}
        </Card.Content>
      </Card>
    );
  });
}

function ResultBadge({ correct, answered }: { correct: boolean; answered: boolean }) {
  const styles = useStyles();
  if (!answered) {
    return <Text style={styles.badgeSkipped}>未作答</Text>;
  }
  return correct
    ? <Text style={styles.badgeCorrect}>✓ 正确</Text>
    : <Text style={styles.badgeWrong}>✗ 错误</Text>;
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  emptyText: { fontSize: 16, color: colors.tertiary, marginBottom: 16 },
  content: { padding: 16, paddingBottom: 32 },
  scoreCard: { borderRadius: 16, elevation: 3, marginBottom: 16 },
  bilingualCard: {
    borderRadius: 12,
    elevation: 1,
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  bilingualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bilingualTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
    flex: 1,
  },
  bilingualToggle: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  bilingualBody: {
    paddingTop: 0,
    paddingBottom: 12,
  },
  bilingualPara: {
    marginBottom: 14,
  },
  bilingualParaIndex: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  bilingualEn: {
    fontSize: 14,
    color: colors.onSurface,
    lineHeight: 22,
    marginBottom: 4,
  },
  bilingualZh: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 22,
  },
  scoreContent: { alignItems: 'center', paddingVertical: 20 },
  scoreLabel: { fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 8 },
  scoreNumber: { fontSize: 56, lineHeight: 60, fontWeight: '800' },
  scorePercent: { fontSize: 15, color: colors.onSurfaceVariant, marginTop: 6 },
  reviewTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  reviewCard: { borderRadius: 12, elevation: 1, marginBottom: 10 },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewIndex: { fontSize: 15, fontWeight: '700', color: colors.primary },
  reviewStem: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginBottom: 10 },
  reviewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    marginBottom: 6,
  },
  reviewOptionCorrect: { borderColor: colors.success, backgroundColor: colors.primaryContainer },
  reviewOptionIncorrect: { borderColor: colors.danger, backgroundColor: colors.errorContainer },
  reviewOptionIndex: { fontSize: 13, fontWeight: '700', color: colors.tertiary, width: 20, textAlign: 'center' },
  reviewOptionIndexCorrect: { color: colors.success },
  reviewOptionIndexIncorrect: { color: colors.danger },
  reviewOptionText: { fontSize: 13, color: colors.onSurface, flex: 1 },
  reviewOptionTextCorrect: { color: colors.success, fontWeight: '500' },
  reviewOptionTextIncorrect: { color: colors.danger },
  checkIcon: { fontSize: 16, color: colors.success, fontWeight: '800', marginLeft: 4 },
  crossIcon: { fontSize: 16, color: colors.danger, fontWeight: '800', marginLeft: 4 },
  explanationBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    elevation: 0,
  },
  explanationLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  explanationText: { fontSize: 13, color: colors.onSurface, lineHeight: 20 },
  badgeCorrect: { fontSize: 13, color: colors.success, fontWeight: '600' },
  badgeWrong: { fontSize: 13, color: colors.danger, fontWeight: '600' },
  badgeSkipped: { fontSize: 13, color: colors.tertiary, fontWeight: '600' },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  footerButton: { flex: 1 },
}));
