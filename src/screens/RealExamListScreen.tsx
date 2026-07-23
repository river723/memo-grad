import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, Text } from 'react-native';
import { Card, SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import realExamsRaw from '../data/realExams.json';
import type { RealExamYear, RealExamSession, RealExamWrongQuestion } from '../types';

const realExams = realExamsRaw as unknown as RealExamYear[];

type SetFilter = 'all' | 'english1' | 'english2';
type PaperStatus = { text: string; color: string };

/**
 * 真题练习入口页：按年份列出可练习的历年真题。
 * - 顶部英一/英二筛选；年份卡片可折叠（默认展开最近一年）。
 * - 每个 passage / 完形入口展示上次得分与待复习错题数，便于续练与回顾。
 */
export default function RealExamListScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [sessions, setSessions] = useState<RealExamSession[]>([]);
  const [wrongs, setWrongs] = useState<RealExamWrongQuestion[]>([]);
  const [filter, setFilter] = useState<SetFilter>('all');
  // 默认展开最近一年，其余折叠，避免十年全铺开
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const sorted = [...realExams].sort((a, b) => b.year - a.year);
    return new Set(sorted.length > 0 ? [sorted[0].year] : []);
  });

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [s, w] = await Promise.all([
          StorageService.getRealExamSessions(),
          StorageService.getRealExamWrongQuestions(),
        ]);
        setSessions(s);
        setWrongs(w);
      })();
    }, [])
  );

  const years = useMemo(() => [...realExams].sort((a, b) => b.year - a.year), []);

  // 按 paperId 聚合：最近一次会话得分 + 当前待复习错题数
  const statusByPaper = useMemo(() => {
    const map = new Map<string, { lastScore: number; lastTotal: number; wrongCount: number }>();
    const latestByPaper = new Map<string, RealExamSession>();
    for (const s of sessions) {
      const cur = latestByPaper.get(s.paperId);
      if (!cur || s.id > cur.id) latestByPaper.set(s.paperId, s);
    }
    latestByPaper.forEach((s, pid) => {
      map.set(pid, { lastScore: s.score, lastTotal: s.total, wrongCount: 0 });
    });
    for (const wq of wrongs) {
      const e = map.get(wq.paperId) ?? { lastScore: 0, lastTotal: 0, wrongCount: 0 };
      e.wrongCount += 1;
      map.set(wq.paperId, e);
    }
    return map;
  }, [sessions, wrongs]);

  const statusFor = (paperId: string): PaperStatus | null => {
    const st = statusByPaper.get(paperId);
    if (!st) return null;
    const parts: string[] = [];
    let color = colors.onSurfaceVariant;
    if (st.lastTotal > 0) {
      const acc = st.lastScore / st.lastTotal;
      parts.push(`上次 ${st.lastScore}/${st.lastTotal}`);
      color = acc >= 0.7 ? palette.success : acc >= 0.5 ? palette.accent : palette.danger;
    }
    if (st.wrongCount > 0) {
      parts.push(`错${st.wrongCount}待复习`);
      if (st.lastTotal === 0) color = palette.accent;
    }
    if (parts.length === 0) return null;
    return { text: parts.join(' · '), color };
  };

  const goReading = (year: number, setId: 'english1' | 'english2', passageId: string) => {
    navigation.navigate('RealExamReading', { year, setId, passageId });
  };

  const goCloze = (year: number, setId: 'english1' | 'english2', paperId: string) => {
    navigation.navigate('RealExamCloze', { year, setId, paperId });
  };

  const toggleYear = (year: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  if (years.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📚</Text>
        <Text style={styles.emptyText}>暂无真题数据</Text>
        <Text style={styles.emptyHint}>后续版本将逐步补充历年真题</Text>
      </View>
    );
  }

  const renderSet = (
    label: string,
    reading: NonNullable<RealExamYear['english1']>['reading'],
    cloze: RealExamYear['english1']['cloze'],
    setId: 'english1' | 'english2',
    yearObj: RealExamYear,
  ) => (
    <View style={styles.setGroup}>
      <Text style={styles.setTitle}>{label}</Text>
      {reading.length > 0 && (
        <View style={styles.entryList}>
          {reading.map((passage, idx) => (
            <EntryRow
              key={passage.id}
              icon="book-open-variant"
              title={passage.title || `Text ${idx + 1}`}
              count={passage.questions.length}
              status={statusFor(passage.id)}
              onPress={() => goReading(yearObj.year, setId, passage.id)}
            />
          ))}
        </View>
      )}
      {cloze && (
        <EntryRow
          icon="format-letter-matches"
          title="完形填空"
          count={20}
          status={statusFor(cloze.id)}
          onPress={() => goCloze(yearObj.year, setId, cloze.id)}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as SetFilter)}
          buttons={[
            { value: 'all', label: '全部' },
            { value: 'english1', label: '英语一' },
            { value: 'english2', label: '英语二' },
          ]}
          style={styles.filter}
        />
        <Text style={styles.tip}>
          共 {years.length} 年真题 · 一次一篇 · 客观题自动评分
        </Text>
        {years.map(year => {
          const isExpanded = expanded.has(year.year);
          return (
            <Card key={year.year} style={styles.yearCard}>
              <TouchableOpacity
                style={styles.yearHeader}
                onPress={() => toggleYear(year.year)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={styles.cardTitle}>{year.year} 年</Text>
                  <Text style={styles.yearSubtitle}>考研英语一 / 英语二</Text>
                </View>
                <Text style={styles.chevron}>{isExpanded ? '收起 ▲' : '展开 ▼'}</Text>
              </TouchableOpacity>
              {isExpanded && (
                <Card.Content>
                  {filter !== 'english2' && renderSet('英语一', year.english1.reading, year.english1.cloze, 'english1', year)}
                  {filter !== 'english1' && renderSet('英语二', year.english2.reading, year.english2.cloze, 'english2', year)}
                </Card.Content>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** 单个真题入口行：图标 + 标题/题数 + 状态（上次得分 / 待复习错题）。 */
function EntryRow({
  icon,
  title,
  count,
  status,
  onPress,
}: {
  icon: string;
  title: string;
  count: number;
  status: PaperStatus | null;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={styles.entryRow}>
        <MaterialCommunityIcons name={icon as any} size={18} color={colors.tertiary} />
        <View style={styles.entryText}>
          <Text style={styles.entryTitle}>{title} ({count}题)</Text>
          {status ? <Text style={[styles.entryStatus, { color: status.color }]}>{status.text}</Text> : null}
        </View>
        <Text style={styles.entryArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  filter: {
    marginBottom: 10,
  },
  tip: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
    textAlign: 'center',
  },
  yearCard: {
    marginBottom: 12,
    elevation: 2,
  },
  yearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.onSurface,
  },
  yearSubtitle: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  chevron: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  setGroup: {
    marginBottom: 12,
  },
  setTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 6,
  },
  entryList: {
    gap: 8,
    marginBottom: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    gap: 10,
  },
  entryText: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.onSurface,
  },
  entryStatus: {
    fontSize: 11,
    marginTop: 2,
  },
  entryArrow: {
    fontSize: 20,
    color: colors.tertiary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.tertiary,
    textAlign: 'center',
  },
}));
