import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Card, Text, Button, Surface, ProgressBar } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { generateId } from '../utils/idUtils';
import { palette } from '../theme/tokens';
import { stripLetterPrefix } from '../components/ReviewOption';
import realExamsRaw from '../data/realExams.json';
import StorageService from '../services/StorageService';
import type {
  RealExamYear,
  RealExamClozePaper,
  RealExamAnswerItem,
  RealExamLetter,
  RealExamSession,
} from '../types';

const realExams = realExamsRaw as unknown as RealExamYear[];

const LETTERS: RealExamLetter[] = ['A', 'B', 'C', 'D'];

/**
 * 完形填空答题屏：一篇 passage（含 [1]..[20] 占位符）+ 20 空四选一。
 * 一期采用"批量提交"模式：所有空作答完毕后统一评分。
 * 上半展示 passage（占位符原样保留，用户阅读时对着编号做题），下半 20 个题条。
 */
export default function RealExamClozeScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamCloze'>();
  const styles = useStyles();

  const { year, setId, paperId } = (route.params || {}) as { year: number; setId: 'english1' | 'english2'; paperId: string };

  const paper: RealExamClozePaper | null = useMemo(() => {
    const y = realExams.find(x => x.year === year);
    const set = y?.[setId];
    return set?.cloze && set.cloze.id === paperId ? set.cloze : null;
  }, [year, setId, paperId]);

  // key: blank index -> selected letter
  const [selections, setSelections] = useState<Record<number, RealExamLetter>>({});

  // 恢复上次未提交的草稿（中途退出后重进可继续）
  useEffect(() => {
    if (!paper) return;
    StorageService.getRealExamDraft(paper.id).then(draft => {
      if (Object.keys(draft).length > 0) setSelections(draft as Record<number, RealExamLetter>);
    });
  }, [paper]);

  if (!paper) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>题目不存在或已被移除</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>
          返回
        </Button>
      </View>
    );
  }

  const total = paper.blanks.length;
  const answeredCount = Object.keys(selections).length;
  const progress = total > 0 ? answeredCount / total : 0;

  const handleSelect = (index: number, letter: RealExamLetter) => {
    setSelections(prev => {
      const next = { ...prev, [index]: letter };
      StorageService.saveRealExamDraft(paper.id, next as Record<string, RealExamLetter>);
      return next;
    });
  };

  const handleSubmit = () => {
    if (answeredCount < total) {
      Alert.alert(
        '还有未作答的题目',
        `共 ${total} 空，已作答 ${answeredCount} 空。确定提交吗？`,
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
    const answers: RealExamAnswerItem[] = paper.blanks.map(b => {
      const selected = selections[b.index] ?? null;
      return {
        questionId: `${paper.id}-b${b.index}`,
        selected,
        correct: selected === b.answer,
      };
    });
    const score = answers.filter(a => a.correct).length;
    const now = Date.now();
    const session: RealExamSession = {
      id: generateId(),
      year,
      mode: 'cloze',
      paperId: paper.id,
      answers,
      score,
      total,
      createdAt: new Date(now).toISOString(),
    };
    StorageService.clearRealExamDraft(paper.id);
    navigation.navigate('RealExamResult', { session, paper, setId });
  };

  return (
    <View style={styles.container}>
      <Surface style={styles.progressBar}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>{year} · Cloze</Text>
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
            <Text style={styles.passageText}>{paper.passage}</Text>
          </Card.Content>
        </Card>

        <Text style={styles.sectionHeader}>题目 (共 {total} 空)</Text>

        {/* 题目列表 */}
        {paper.blanks.map(b => {
          const selected = selections[b.index];
          return (
            <Card key={b.index} style={styles.blankCard}>
              <Card.Content>
                <Text style={styles.blankIndex}>[{b.index}]</Text>
                <View style={styles.optionsRow}>
                  {b.options.map((opt, oIdx) => {
                    const letter = LETTERS[oIdx];
                    const isSelected = selected === letter;
                    return (
                      <TouchableOpacity
                        key={letter}
                        activeOpacity={0.7}
                        onPress={() => handleSelect(b.index, letter)}
                        style={styles.optionPressable}
                      >
                        <View style={[styles.optionButton, isSelected && styles.optionSelected]}>
                          <Text style={[styles.optionIndex, isSelected && styles.optionIndexSelected]}>
                            {letter}
                          </Text>
                          <Text
                            style={[styles.optionText, isSelected && styles.optionTextSelected]}
                            numberOfLines={2}
                          >
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
          {answeredCount === total ? '所有空已作答，可提交' : `还有 ${total - answeredCount} 空未作答`}
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
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    marginBottom: 8,
    marginTop: 4,
  },
  blankCard: { borderRadius: 12, elevation: 1, marginBottom: 8 },
  blankIndex: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionPressable: {
    width: '48%',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.outline,
    minHeight: 40,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  optionIndex: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.tertiary,
    width: 18,
    textAlign: 'center',
  },
  optionIndexSelected: { color: colors.primary },
  optionText: { fontSize: 13, color: colors.onSurface, flex: 1 },
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
