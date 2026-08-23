import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, ScrollView, Pressable, Text } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppIcon, { type IconName } from '../components/ds/AppIcon';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { getExamYears, getExamSet, type ExamSet } from '../utils/realExamContent';
import type { RealExamYear, RealExamSession, RealExamWrongQuestion } from '../types';
import EmptyState from '../components/ds/EmptyState';

type SetFilter = 'all' | 'english1' | 'english2';
type PaperStatus = { text: string; color: string };

type YearEntry = {
  year: number;
  english1: RealExamYear['english1'] | null;
  english2: RealExamYear['english2'] | null;
};

export default function RealExamListScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [sessions, setSessions] = useState<RealExamSession[]>([]);
  const [wrongs, setWrongs] = useState<RealExamWrongQuestion[]>([]);
  const [filter, setFilter] = useState<SetFilter>('all');
  const [years, setYears] = useState<YearEntry[]>([]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const yearNums = await getExamYears();
        if (cancelled) return;
        const entries = yearNums.map((y) => ({ year: y, english1: null, english2: null }));
        setYears(entries);
        if (entries.length > 0) {
          setExpanded(new Set([entries[0].year]));
          loadYearContent(entries[0].year);
        }
      } catch (err) {
        console.warn('[RealExamList] 拉取年份列表失败：', err);
      } finally {
        if (!cancelled) setLoadingYears(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadYearContent = useCallback((year: number) => {
    setYears((prev) => {
      const entry = prev.find((e) => e.year === year);
      if (!entry || (entry.english1 && entry.english2)) return prev;
      (async () => {
        try {
          const [e1, e2] = await Promise.all([
            getExamSet(year, 'english1').catch((err) => {
              console.warn(`[RealExamList] 拉取 ${year} english1 失败：`, err);
              return null as ExamSet | null;
            }),
            getExamSet(year, 'english2').catch((err) => {
              console.warn(`[RealExamList] 拉取 ${year} english2 失败：`, err);
              return null as ExamSet | null;
            }),
          ]);
          setYears((cur) =>
            cur.map((e) =>
              e.year === year
                ? { ...e, english1: e1 ?? e.english1, english2: e2 ?? e.english2 }
                : e
            )
          );
        } catch {
          /* 双拉失败已各自 catch */
        }
      })();
      return prev;
    });
  }, []);

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
      color = acc >= 0.7 ? colors.success : acc >= 0.5 ? colors.warning : colors.danger;
    }
    if (st.wrongCount > 0) {
      parts.push(`错${st.wrongCount}待复习`);
      if (st.lastTotal === 0) color = colors.warning;
    }
    if (parts.length === 0) return null;
    return { text: parts.join(' · '), color };
  };

  const goReading = (year: number, setId: 'english1' | 'english2', passageId: string) =>
    navigation.navigate('RealExamReading', { year, setId, passageId });
  const goCloze = (year: number, setId: 'english1' | 'english2', paperId: string) =>
    navigation.navigate('RealExamCloze', { year, setId, paperId });
  const goNewType = (year: number, setId: 'english1' | 'english2', paperId: string) =>
    navigation.navigate('RealExamNewType', { year, setId, paperId });
  const goTranslation = (year: number, setId: 'english1' | 'english2', paperId: string) =>
    navigation.navigate('RealExamTranslation', { year, setId, paperId });
  const goWriting = (year: number, setId: 'english1' | 'english2', paperId: string) =>
    navigation.navigate('RealExamWriting', { year, setId, paperId });

  const toggleYear = (year: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
        loadYearContent(year);
      }
      return next;
    });
  };

  if (loadingYears) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ color: colors.onSurfaceVariant }}>真题加载中…</Text>
      </View>
    );
  }

  if (years.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="book-open-page-variant"
          title="暂无真题数据"
          description="后续版本将逐步补充历年真题，敬请期待。"
        />
      </View>
    );
  }

  const renderSet = (
    label: string,
    set: RealExamYear['english1'] | null,
    setId: 'english1' | 'english2',
    yearObj: YearEntry
  ) => {
    if (!set) {
      return (
        <View style={styles.setGroup}>
          <Text style={styles.setTitle}>{label}</Text>
          <Text style={styles.setLoading}>加载中…</Text>
        </View>
      );
    }
    const { reading, cloze, newType, translation, writing } = set;
    return (
      <View style={styles.setGroup}>
        <Text style={styles.setTitle}>{label}</Text>
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
          {cloze && (
            <EntryRow
              icon="format-letter-matches"
              title="完形填空"
              count={20}
              status={statusFor(cloze.id)}
              onPress={() => goCloze(yearObj.year, setId, cloze.id)}
            />
          )}
          {newType && (
            <EntryRow
              icon="sort-variant"
              title="新题型"
              count={newType.questions.length}
              status={statusFor(newType.id)}
              onPress={() => goNewType(yearObj.year, setId, newType.id)}
            />
          )}
          {translation && (
            <EntryRow
              icon="translate"
              title="翻译"
              badge="阅览"
              onPress={() => goTranslation(yearObj.year, setId, translation.id)}
            />
          )}
          {writing && (
            <EntryRow
              icon="pencil-outline"
              title="写作"
              badge="阅览"
              onPress={() => goWriting(yearObj.year, setId, writing.id)}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as SetFilter)}
          buttons={[
            { value: 'all', label: '全部' },
            { value: 'english1', label: '英语一' },
            { value: 'english2', label: '英语二' },
          ]}
        />
        <Text style={styles.tip}>
          共 {years.length} 年真题 · 一次一篇 · 客观题自动评分
        </Text>
        {years.map(year => {
          const isExpanded = expanded.has(year.year);
          return (
            <View
              key={year.year}
              style={[
                styles.yearCard,
                { backgroundColor: colors.surface, borderColor: colors.outline, borderRadius: radius.lg },
              ]}
            >
              <Pressable
                onPress={() => toggleYear(year.year)}
                style={({ pressed }) => [styles.yearHeader, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View>
                  <Text style={styles.cardTitle}>{year.year} 年</Text>
                  <Text style={styles.yearSubtitle}>考研英语一 / 英语二</Text>
                </View>
                <MaterialCommunityIcons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={colors.primary}
                />
              </Pressable>
              {isExpanded && (
                <View style={styles.yearBody}>
                  {filter !== 'english2' && renderSet('英语一', year.english1, 'english1', year)}
                  {filter !== 'english1' && renderSet('英语二', year.english2, 'english2', year)}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function EntryRow({
  icon,
  title,
  count,
  badge,
  status,
  onPress,
}: {
  icon: IconName;
  title: string;
  count?: number;
  badge?: string;
  status?: PaperStatus | null;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const typography = colors.typography;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.entryRow, { borderColor: colors.outline, opacity: pressed ? 0.7 : 1 }]}>
      <AppIcon name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: typography.bodySm.size, fontWeight: '500', color: colors.onSurface }}>
          {title}{count != null ? ` (${count}题)` : ''}{badge ? ` · ${badge}` : ''}
        </Text>
        {status ? (
          <Text style={{ fontSize: typography.caption.size, color: status.color, marginTop: 2 }}>
            {status.text}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.tertiary} />
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  tip: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginVertical: 10,
    textAlign: 'center',
  },
  yearCard: {
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  yearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  yearSubtitle: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  yearBody: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  setGroup: {
    marginBottom: 12,
  },
  setLoading: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  setTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 8,
  },
  entryList: {
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    gap: 10,
  },
}));
