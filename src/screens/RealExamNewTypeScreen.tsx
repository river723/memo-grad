import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Card, Text, Button, Surface, ProgressBar } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { generateId } from '../utils/idUtils';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { getExamSet } from '../utils/realExamContent';
import type {
  RealExamNewTypePaper,
  RealExamAnswerItem,
  RealExamOptionLetter,
  RealExamSession,
} from '../types';

const SUBTYPE_LABEL: Record<RealExamNewTypePaper['subtype'], string> = {
  ordering: '段落排序',
  heading: '段落小标题（7选5）',
  sentence: '选句填空（7选5）',
  matching: '多项对应（信息匹配）',
  truefalse: '正误判断（T/F）',
};

/**
 * 新题型（Part B）答题屏：段落排序 / 段落小标题 / 选句填空 / 多项对应。
 * 统一为"每个位号 41-45 从选项池 A-H 中选一个字母"的匹配题。
 * 交互：先读文章/段落池，为每个位号选字母 → 提交判分 → 同屏揭晓对错与解析。
 * 与阅读/完形一样写入 session 与真题错题本（mode='newtype'）。
 */
export default function RealExamNewTypeScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamNewType'>();
  const styles = useStyles();

  const { year, setId, paperId } = (route.params || {}) as {
    year: number;
    setId: 'english1' | 'english2';
    paperId: string;
  };

  // 异步拉取套卷
  const [paper, setPaper] = useState<RealExamNewTypePaper | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const set = await getExamSet(year, setId);
        const nt = set?.newType && set.newType.id === paperId ? set.newType : null;
        if (!cancelled) setPaper(nt);
      } catch (err) {
        console.warn('[RealExamNewType] 拉取套卷失败：', err);
        if (!cancelled) setPaper(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, setId, paperId]);

  // key: 位号(字符串) -> 选中字母
  const [selections, setSelections] = useState<Record<string, RealExamOptionLetter>>({});
  const [submitted, setSubmitted] = useState(false);
  const savedRef = useRef(false);

  // 恢复未提交草稿
  useEffect(() => {
    if (!paper) return;
    StorageService.getRealExamDraft(paper.id).then(draft => {
      if (Object.keys(draft).length > 0) setSelections(draft);
    });
  }, [paper]);

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>真题加载中…</Text>
      </View>
    );
  }

  if (!paper) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>题目不存在或已被移除</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>返回</Button>
      </View>
    );
  }

  // 需作答的位号（排序题固定段不作答；此处 questions 已只含 41-45）
  const questions = paper.questions;
  const total = questions.length;
  const answeredCount = Object.keys(selections).length;
  const progress = total > 0 ? answeredCount / total : 0;

  const handleSelect = (index: number, letter: RealExamOptionLetter) => {
    if (submitted) return;
    setSelections(prev => {
      const next = { ...prev, [String(index)]: letter };
      StorageService.saveRealExamDraft(paper.id, next);
      return next;
    });
  };

  const doSubmit = async () => {
    const answers: RealExamAnswerItem[] = questions.map(q => {
      const selected = selections[String(q.index)] ?? null;
      return {
        questionId: `${paper.id}-p${q.index}`,
        selected,
        correct: selected === q.answer,
      };
    });
    const score = answers.filter(a => a.correct).length;
    const now = Date.now();
    const session: RealExamSession = {
      id: generateId(),
      year,
      mode: 'newtype',
      paperId: paper.id,
      answers,
      score,
      total,
      createdAt: new Date(now).toISOString(),
    };
    setSubmitted(true);
    await StorageService.clearRealExamDraft(paper.id);
    if (!savedRef.current) {
      savedRef.current = true;
      try {
        await StorageService.saveRealExamSession(session);
        await StorageService.addOrUpdateRealExamWrongQuestions(session, paper, setId);
      } catch (err) {
        console.error('保存新题型练习记录失败:', err);
      }
    }
  };

  const handleSubmit = () => {
    if (answeredCount < total) {
      Alert.alert(
        '还有未作答的题目',
        `共 ${total} 题，已作答 ${answeredCount} 题。确定提交吗？`,
        [
          { text: '继续作答', style: 'cancel' },
          { text: '直接提交', onPress: doSubmit, style: 'destructive' },
        ]
      );
      return;
    }
    doSubmit();
  };

  const handleRetry = () => {
    setSelections({});
    setSubmitted(false);
    savedRef.current = false;
  };

  const score = questions.filter(q => selections[String(q.index)] === q.answer).length;

  return (
    <View style={styles.container}>
      <Surface style={styles.progressBar}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>{year} · {SUBTYPE_LABEL[paper.subtype]}</Text>
          {submitted
            ? <Text style={styles.progressCount}>得分 {score} / {total}</Text>
            : <Text style={styles.progressCount}>已答 {answeredCount} / {total}</Text>}
        </View>
        <ProgressBar progress={submitted ? 1 : progress} color={palette.primary} style={styles.bar} />
      </Surface>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Directions */}
        <Card style={styles.dirCard}>
          <Card.Content>
            <View style={styles.sectionTag}>
              <Text style={styles.sectionTagText}>Directions</Text>
            </View>
            <Text style={styles.dirText}>{paper.direction}</Text>
          </Card.Content>
        </Card>

        {/* 文章正文（标题匹配/选句填空/多项对应有；排序题无） */}
        {paper.passage ? (
          <Card style={styles.passageCard}>
            <Card.Content>
              <View style={styles.sectionTag}>
                <Text style={styles.sectionTagText}>Text</Text>
              </View>
              <Text style={styles.passageText}>{paper.passage}</Text>
            </Card.Content>
          </Card>
        ) : null}

        {/* 选项池 A-H（正误判断题无选项池，选项 T/F 直接在每题下方） */}
        {paper.subtype !== 'truefalse' ? (
          <Card style={styles.poolCard}>
            <Card.Content>
              <View style={styles.sectionTag}>
                <Text style={styles.sectionTagText}>
                  {paper.subtype === 'ordering' ? 'Paragraphs' : 'Options'}
                </Text>
              </View>
              {paper.options.map(o => (
                <View key={o.letter} style={styles.poolItem}>
                  <Text style={styles.poolLetter}>
                    [{o.letter}]{o.fixed ? ' ·已给定' : ''}
                  </Text>
                  <Text style={styles.poolText}>{o.text}</Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : null}

        {/* 位号作答区 */}
        <Text style={styles.answerTitle}>作答区（41–45）</Text>
        {questions.map(q => {
          const selected = selections[String(q.index)];
          const isCorrect = selected === q.answer;
          return (
            <Card key={q.index} style={styles.questionCard}>
              <Card.Content>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionIndex}>第 {q.index} 题</Text>
                  {submitted ? (
                    selected == null
                      ? <Text style={styles.badgeSkipped}>未作答</Text>
                      : isCorrect
                        ? <Text style={styles.badgeCorrect}>✓ 正确</Text>
                        : <Text style={styles.badgeWrong}>✗ 应选 {q.answer}</Text>
                  ) : null}
                </View>
                {/* 正误判断题：显示陈述句（stem） */}
                {paper.subtype === 'truefalse' && q.stem ? (
                  <Text style={styles.stemText}>{q.stem}</Text>
                ) : null}
                {/* 字母选择器（横向） */}
                <View style={styles.letterRow}>
                  {paper.options.map(o => {
                    const isSel = selected === o.letter;
                    const showCorrect = submitted && o.letter === q.answer;
                    const showWrong = submitted && isSel && !isCorrect;
                    return (
                      <TouchableOpacity
                        key={o.letter}
                        activeOpacity={0.7}
                        disabled={submitted || o.fixed}
                        onPress={() => handleSelect(q.index, o.letter)}
                      >
                        <View
                          style={[
                            styles.letterChip,
                            isSel && styles.letterChipSel,
                            o.fixed && styles.letterChipDisabled,
                            showCorrect && styles.letterChipCorrect,
                            showWrong && styles.letterChipWrong,
                          ]}
                        >
                          <Text
                            style={[
                              styles.letterChipText,
                              isSel && styles.letterChipTextSel,
                              (showCorrect || showWrong) && styles.letterChipTextEmph,
                            ]}
                          >
                            {o.letter}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {submitted && q.explanation ? (
                  <Surface style={styles.explanationBox}>
                    <Text style={styles.explanationLabel}>解析</Text>
                    <Text style={styles.explanationText}>{q.explanation}</Text>
                  </Surface>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}

        {submitted ? (
          <View style={styles.footerActions}>
            <Button mode="outlined" onPress={() => navigation.navigate('RealExamList')} style={styles.footerButton}>
              返回列表
            </Button>
            <Button mode="contained" onPress={handleRetry} style={styles.footerButton} icon="restart">
              再练一次
            </Button>
          </View>
        ) : null}
      </ScrollView>

      {!submitted ? (
        <Surface style={styles.bottomBar}>
          <Text style={styles.bottomHint}>
            {answeredCount === total ? '所有题目已作答，可提交' : `还有 ${total - answeredCount} 题未作答`}
          </Text>
          <Button mode="contained" onPress={handleSubmit} disabled={answeredCount === 0} icon="check-circle">
            提交
          </Button>
        </Surface>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32,
    backgroundColor: colors.background,
  },
  emptyText: { fontSize: 16, color: colors.tertiary, marginBottom: 16 },
  progressBar: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: colors.surface, elevation: 2,
  },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  progressText: { fontSize: 14, fontWeight: '600', color: colors.onSurface, flex: 1 },
  progressCount: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  bar: { height: 6, borderRadius: 3 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  dirCard: { borderRadius: 12, elevation: 1, marginBottom: 12, backgroundColor: colors.surface },
  passageCard: { borderRadius: 12, elevation: 2, marginBottom: 12 },
  poolCard: { borderRadius: 12, elevation: 2, marginBottom: 16 },
  sectionTag: {
    alignSelf: 'flex-start', backgroundColor: colors.primaryContainer,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 10,
  },
  sectionTagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  dirText: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 20 },
  passageText: { fontSize: 15, color: colors.onSurface, lineHeight: 24 },
  poolItem: { marginBottom: 12 },
  poolLetter: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  poolText: { fontSize: 14, color: colors.onSurface, lineHeight: 21 },
  answerTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  questionCard: { borderRadius: 12, elevation: 1, marginBottom: 10 },
  questionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  questionIndex: { fontSize: 15, fontWeight: '700', color: colors.primary },
  stemText: { fontSize: 14, color: colors.onSurface, lineHeight: 21, marginBottom: 10 },
  letterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  letterChip: {
    width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline,
  },
  letterChipSel: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  letterChipDisabled: { opacity: 0.4 },
  letterChipCorrect: { borderColor: palette.success, backgroundColor: palette.successLight },
  letterChipWrong: { borderColor: palette.danger, backgroundColor: palette.dangerLight },
  letterChipText: { fontSize: 16, fontWeight: '700', color: colors.onSurface },
  letterChipTextSel: { color: colors.primary },
  letterChipTextEmph: { fontWeight: '800' },
  explanationBox: {
    marginTop: 10, padding: 10, borderRadius: 8,
    backgroundColor: colors.primaryContainer, elevation: 0,
  },
  explanationLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  explanationText: { fontSize: 13, color: colors.onSurface, lineHeight: 20 },
  badgeCorrect: { fontSize: 13, color: palette.success, fontWeight: '600' },
  badgeWrong: { fontSize: 13, color: palette.danger, fontWeight: '600' },
  badgeSkipped: { fontSize: 13, color: colors.tertiary, fontWeight: '600' },
  footerActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  footerButton: { flex: 1 },
  bottomBar: {
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, elevation: 4,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  bottomHint: { fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },
}));
