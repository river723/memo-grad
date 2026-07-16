import React, { useEffect, useRef } from 'react';
import { View, ScrollView, BackHandler } from 'react-native';
import { Card, Text, Button, Surface } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import type {
  RealExamSession,
  RealExamReadingPassage,
  RealExamClozePaper,
  RealExamLetter,
} from '../types';

const LETTERS: RealExamLetter[] = ['A', 'B', 'C', 'D'];

type RouteParams = {
  session: RealExamSession;
  passage?: RealExamReadingPassage;   // reading 模式带
  paper?: RealExamClozePaper;         // cloze 模式带
  setId?: 'english1' | 'english2';    // 英语一/英语二标识
};

/**
 * 真题结果屏：显示得分、逐题回顾。
 * - 挂载时把 session 存到 AsyncStorage（saveRealExamSession），并写一条 StudyRecord。
 * - 不写入单词错题本（真题错题以题为维度，与单词错题本模型不一致）。
 * - 拦截安卓返回键，避免用户从结果屏回到答题屏造成疑惑；改为返回列表。
 */
export default function RealExamResultScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamResult'>();
  const styles = useStyles();
  const savedRef = useRef(false);

  const { session, passage, paper, setId } = (route.params || {}) as RouteParams;

  useEffect(() => {
    if (savedRef.current || !session) return;
    savedRef.current = true;
    (async () => {
      try {
        await StorageService.saveRealExamSession(session);
        // 记一条学习记录（按题数汇总；result 只能 0/1，这里存整体判定：满分算 1，其他算 0 更严格）
        await StorageService.addStudyRecord({
          word_id: 0,                                // 真题不绑定单词
          study_date: session.createdAt.split('T')[0],
          result: session.score === session.total ? 1 : 0,
          study_mode: 'real_exam',
        });
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
                { color: percentage >= 60 ? palette.success : palette.danger },
              ]}
            >
              {session.score} / {session.total}
            </Text>
            <Text style={styles.scorePercent}>正确率 {percentage}%</Text>
          </Card.Content>
        </Card>

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
            return renderReviewOption(styles, letter, opt, letter === q.answer, letter === selected);
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
            return renderReviewOption(styles, letter, opt, letter === b.answer, letter === selected);
          })}
        </Card.Content>
      </Card>
    );
  });
}

function renderReviewOption(
  styles: any,
  letter: RealExamLetter,
  option: string,
  isCorrect: boolean,
  isSelected: boolean,
) {
  let optionStyle = styles.reviewOption;
  let indexStyle = styles.reviewOptionIndex;
  let textStyle = styles.reviewOptionText;
  if (isCorrect) {
    optionStyle = { ...optionStyle, ...styles.reviewOptionCorrect };
    indexStyle = { ...indexStyle, ...styles.reviewOptionIndexCorrect };
    textStyle = { ...textStyle, ...styles.reviewOptionTextCorrect };
  } else if (isSelected) {
    optionStyle = { ...optionStyle, ...styles.reviewOptionIncorrect };
    indexStyle = { ...indexStyle, ...styles.reviewOptionIndexIncorrect };
    textStyle = { ...textStyle, ...styles.reviewOptionTextIncorrect };
  }
  return (
    <View key={letter} style={optionStyle}>
      <Text style={indexStyle}>{letter}</Text>
      <Text style={textStyle}>{stripLetterPrefix(option, letter)}</Text>
      {isCorrect ? <Text style={styles.checkIcon}>✓</Text> : null}
      {isSelected && !isCorrect ? <Text style={styles.crossIcon}>✗</Text> : null}
    </View>
  );
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

function stripLetterPrefix(option: string, letter: RealExamLetter): string {
  const prefix1 = `${letter}) `;
  const prefix2 = `${letter}. `;
  if (option.startsWith(prefix1)) return option.slice(prefix1.length);
  if (option.startsWith(prefix2)) return option.slice(prefix2.length);
  return option;
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
  scoreContent: { alignItems: 'center', paddingVertical: 20 },
  scoreLabel: { fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 8 },
  scoreNumber: { fontSize: 44, fontWeight: 'bold' },
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
  reviewOptionCorrect: { borderColor: palette.success, backgroundColor: palette.successLight },
  reviewOptionIncorrect: { borderColor: palette.danger, backgroundColor: palette.dangerLight },
  reviewOptionIndex: { fontSize: 13, fontWeight: '700', color: colors.tertiary, width: 20, textAlign: 'center' },
  reviewOptionIndexCorrect: { color: palette.successDark },
  reviewOptionIndexIncorrect: { color: palette.dangerDark },
  reviewOptionText: { fontSize: 13, color: colors.onSurface, flex: 1 },
  reviewOptionTextCorrect: { color: palette.successDark, fontWeight: '500' },
  reviewOptionTextIncorrect: { color: palette.dangerDark },
  checkIcon: { fontSize: 16, color: palette.success, fontWeight: '800', marginLeft: 4 },
  crossIcon: { fontSize: 16, color: palette.danger, fontWeight: '800', marginLeft: 4 },
  explanationBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    elevation: 0,
  },
  explanationLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  explanationText: { fontSize: 13, color: colors.onSurface, lineHeight: 20 },
  badgeCorrect: { fontSize: 13, color: palette.success, fontWeight: '600' },
  badgeWrong: { fontSize: 13, color: palette.danger, fontWeight: '600' },
  badgeSkipped: { fontSize: 13, color: colors.tertiary, fontWeight: '600' },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  footerButton: { flex: 1 },
}));
