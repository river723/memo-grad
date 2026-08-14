import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Card, Text, Button, Surface, ProgressBar } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { generateId } from '../utils/idUtils';
import { palette } from '../theme/tokens';
import { stripLetterPrefix } from '../components/ReviewOption';
import { getExamSet } from '../utils/realExamContent';
import StorageService from '../services/StorageService';
import type {
  RealExamReadingPassage,
  RealExamAnswerItem,
  RealExamLetter,
  RealExamSession,
} from '../types';

const LETTERS: RealExamLetter[] = ['A', 'B', 'C', 'D'];

/**
 * 阅读理解答题屏：一篇 passage + 4-5 道单选。
 * 交互：先看文章（可滚动），点击题目区选项做题；全部作答后"提交"进结果屏。
 * 一期不做"选中即揭晓"，保持真题式"整篇做完再看答案"。
 */
export default function RealExamReadingScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamReading'>();
  const styles = useStyles();

  const { year, setId, passageId } = (route.params || {}) as { year: number; setId: 'english1' | 'english2'; passageId: string };

  // 异步拉取套卷：getExamSet 带内存/AsyncStorage 缓存，命中后即时返回
  const [passage, setPassage] = useState<RealExamReadingPassage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const set = await getExamSet(year, setId);
        const found = set?.reading.find(p => p.id === passageId) ?? null;
        if (!cancelled) setPassage(found);
      } catch (err) {
        console.warn('[RealExamReading] 拉取套卷失败：', err);
        if (!cancelled) setPassage(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, setId, passageId]);

  // key: questionId -> selected letter
  const [selections, setSelections] = useState<Record<string, RealExamLetter>>({});

  // 恢复上次未提交的草稿（中途退出后重进可继续）
  useEffect(() => {
    if (!passage) return;
    StorageService.getRealExamDraft(passage.id).then(draft => {
      if (Object.keys(draft).length > 0) setSelections(draft as Record<string, RealExamLetter>);
    });
  }, [passage]);

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>真题加载中…</Text>
      </View>
    );
  }

  if (!passage) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>题目不存在或已被移除</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>
          返回
        </Button>
      </View>
    );
  }

  const answeredCount = Object.keys(selections).length;
  const total = passage.questions.length;
  const progress = total > 0 ? answeredCount / total : 0;

  const handleSelect = (questionId: string, letter: RealExamLetter) => {
    setSelections(prev => {
      const next = { ...prev, [questionId]: letter };
      StorageService.saveRealExamDraft(passage.id, next);
      return next;
    });
  };

  const handleSubmit = () => {
    if (answeredCount < total) {
      Alert.alert(
        '还有未作答的题目',
        `共 ${total} 题，已作答 ${answeredCount} 题。确定提交吗？`,
        [
          { text: '继续作答', style: 'cancel' },
          { text: '直接提交', onPress: submitNow, style: 'destructive' },
        ]
      );
      return;
    }
    submitNow();
  };

  const submitNow = () => {
    const answers: RealExamAnswerItem[] = passage.questions.map(q => {
      const selected = selections[q.id] ?? null;
      return {
        questionId: q.id,
        selected,
        correct: selected === q.answer,
      };
    });
    const score = answers.filter(a => a.correct).length;
    const now = Date.now();
    const session: RealExamSession = {
      id: generateId(),
      year,
      mode: 'reading',
      paperId: passage.id,
      answers,
      score,
      total,
      createdAt: new Date(now).toISOString(),
    };
    StorageService.clearRealExamDraft(passage.id);
    navigation.navigate('RealExamResult', { session, passage, setId });
  };

  return (
    <View style={styles.container}>
      <Surface style={styles.progressBar}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>{year} · {passage.title || 'Reading'}</Text>
          <Text style={styles.progressCount}>已答 {answeredCount} / {total}</Text>
        </View>
        <ProgressBar progress={progress} color={palette.primary} style={styles.bar} />
      </Surface>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 文章正文 */}
        <Card style={styles.passageCard}>
          <Card.Content>
            <View style={styles.sectionTag}>
              <Text style={styles.sectionTagText}>Passage</Text>
            </View>
            <Text style={styles.passageText}>{passage.passage}</Text>
          </Card.Content>
        </Card>

        {/* 题目列表 */}
        {passage.questions.map((q, idx) => {
          const selected = selections[q.id];
          return (
            <Card key={q.id} style={styles.questionCard}>
              <Card.Content>
                <Text style={styles.questionIndex}>Q{idx + 1}.</Text>
                <Text style={styles.questionStem}>{q.stem}</Text>
                <View style={styles.optionsGrid}>
                  {q.options.map((opt, oIdx) => {
                    const letter = LETTERS[oIdx];
                    const isSelected = selected === letter;
                    return (
                      <TouchableOpacity
                        key={letter}
                        activeOpacity={0.7}
                        onPress={() => handleSelect(q.id, letter)}
                      >
                        <View style={[styles.optionButton, isSelected && styles.optionSelected]}>
                          <Text style={[styles.optionIndex, isSelected && styles.optionIndexSelected]}>
                            {letter}
                          </Text>
                          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                            {stripLetterPrefix(opt, letter)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card.Content>
            </Card>
          );
        })}
      </ScrollView>

      <Surface style={styles.bottomBar}>
        <Text style={styles.bottomHint}>
          {answeredCount === total ? '所有题目已作答，可提交' : `还有 ${total - answeredCount} 题未作答`}
        </Text>
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={answeredCount === 0}
          icon="check-circle"
        >
          提交
        </Button>
      </Surface>
    </View>
  );
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
  progressBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressText: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  progressCount: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  bar: { height: 6, borderRadius: 3 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  passageCard: { borderRadius: 12, elevation: 2, marginBottom: 16 },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  sectionTagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  passageText: { fontSize: 15, color: colors.onSurface, lineHeight: 24 },
  questionCard: { borderRadius: 12, elevation: 2, marginBottom: 12 },
  questionIndex: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  questionStem: { fontSize: 15, color: colors.onSurface, lineHeight: 22, marginBottom: 12 },
  optionsGrid: { gap: 8 },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.outline,
    minHeight: 44,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  optionIndex: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.tertiary,
    width: 24,
    textAlign: 'center',
    marginTop: 1,
  },
  optionIndexSelected: { color: colors.primary },
  optionText: { fontSize: 14, color: colors.onSurface, flex: 1, lineHeight: 20 },
  optionTextSelected: { color: colors.primary, fontWeight: '500' },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    elevation: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomHint: { fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },
}));
