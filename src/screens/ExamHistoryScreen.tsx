import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation, useAppRoute, type ExamHistoryFilter } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { getExamSet } from '../utils/realExamContent';
import { ExamSession, RealExamSession } from '../types';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import AppButton from '../components/ds/AppButton';
import AppIcon from '../components/ds/AppIcon';
import EmptyState from '../components/ds/EmptyState';

/** 统一历史条目：AI 出题与真题两个来源，按 createdAt 归一排序。 */
type UnifiedItem =
  | { kind: 'ai'; session: ExamSession }
  | { kind: 'real'; session: RealExamSession };

const FILTERS: { key: ExamHistoryFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ai', label: 'AI 出题' },
  { key: 'real', label: '真题' },
];

const realModeLabel = (mode: string, year: number) => {
  const name = mode === 'reading' ? '阅读理解' : mode === 'cloze' ? '完形填空' : '新题型';
  return `真题·${name} ${year}`;
};

export default function ExamHistoryScreen() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const navigation = useAppNavigation();
  const route = useAppRoute<'ExamHistory'>();
  const [filter, setFilter] = useState<ExamHistoryFilter>(
    route.params?.initialFilter ?? 'all'
  );
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [realSessions, setRealSessions] = useState<RealExamSession[]>([]);

  const renderChip = (f: { key: ExamHistoryFilter; label: string }) => {
    const active = filter === f.key;
    return (
      <Pressable
        key={f.key}
        onPress={() => setFilter(f.key)}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.outline,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: active ? colors.onPrimary : colors.onSurfaceVariant,
            fontSize: typography.caption.size,
            fontWeight: '600',
          }}
        >
          {f.label}
        </Text>
      </Pressable>
    );
  };

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [])
  );

  const loadSessions = async () => {
    const [ai, real] = await Promise.all([
      StorageService.getExamSessions(),
      StorageService.getRealExamSessions(),
    ]);
    ai.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    real.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setSessions(ai);
    setRealSessions(real);
  };

  /**
   * 练习活动流水：全部作答记录按 created_at 倒序平铺——重做/复习各占一行，
   * 这才是"历史"。套题聚合视图在 ExamSetBank（题库）。
   */
  const items = useMemo<UnifiedItem[]>(() => {
    const merged: UnifiedItem[] = [
      ...sessions.map(session => ({ kind: 'ai' as const, session })),
      ...realSessions.map(session => ({ kind: 'real' as const, session })),
    ];
    const timeOf = (it: UnifiedItem) =>
      new Date(it.kind === 'ai' ? it.session.created_at : it.session.createdAt).getTime();
    merged.sort((a, b) => timeOf(b) - timeOf(a));
    if (filter === 'all') return merged;
    return merged.filter(it => it.kind === (filter === 'ai' ? 'ai' : 'real'));
  }, [sessions, realSessions, filter]);

  const handleDelete = async (kind: 'ai' | 'real', id: string) => {
    const confirmed = await showConfirm('删除记录', '确定要删除这条练习记录吗？', {
      confirmText: '删除',
      cancelText: '取消',
    }).catch(() => false);
    if (!confirmed) return;
    if (kind === 'ai') {
      await StorageService.deleteExamSession(id);
    } else {
      await StorageService.deleteRealExamSession(id);
    }
    loadSessions();
  };

  const handleRedo = (session: ExamSession) => {
    // 重放该行题目：originId 指回所属套题根记录，新行仍归入同一套题；
    // 错题复习行（source='wrong_review'）重放后仍标记为复习来源
    navigation.navigate('ExamAnswer', {
      questions: session.questions,
      questionType: session.question_type,
      originId: session.origin_id ?? undefined,
      source: session.source,
    });
  };

  /**
   * 打开一条真题的归档回顾：session 本身不含题目，需按 year+paperId
   * 在英语一/英语二两套卷中定位原文（getExamSet 走内存/本地缓存，通常即时返回）。
   * 新题型结果屏不支持逐题回顾、或内容拉取失败时，退回真题列表重练。
   */
  const handleViewReal = async (session: RealExamSession) => {
    if (session.mode === 'newtype') {
      navigation.navigate('RealExamList');
      return;
    }
    try {
      const sets = await Promise.all([
        getExamSet(session.year, 'english1').catch(() => null),
        getExamSet(session.year, 'english2').catch(() => null),
      ]);
      for (let i = 0; i < sets.length; i++) {
        const set = sets[i];
        if (!set) continue;
        const setId = i === 0 ? ('english1' as const) : ('english2' as const);
        if (session.mode === 'reading') {
          const passage = set.reading.find(p => p.id === session.paperId);
          if (passage) {
            navigation.navigate('RealExamResult', { session, passage, setId, archived: true });
            return;
          }
        } else if (set.cloze && set.cloze.id === session.paperId) {
          navigation.navigate('RealExamResult', { session, paper: set.cloze, setId, archived: true });
          return;
        }
      }
    } catch (error) {
      console.warn('[ExamHistory] 定位真题内容失败:', error);
    }
    navigation.navigate('RealExamList');
  };

  const getAccuracyColor = (rate: number) => {
    if (rate >= 0.8) return colors.success;
    if (rate >= 0.6) return colors.warning;
    return colors.danger;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hours}:${mins}`;
  };

  const renderRow = (item: UnifiedItem) => {
    const isAi = item.kind === 'ai';
    const createdAt = isAi ? item.session.created_at : item.session.createdAt;
    const total = isAi ? item.session.questions.length : item.session.total;
    const correctCount = isAi
      ? item.session.answers.filter(a => a.is_correct).length
      : item.session.score;
    const accuracy = total > 0 ? correctCount / total : 0;
    const label =
      (isAi && item.session.source === 'wrong_review' ? '错题复习·' : '') +
      (isAi
        ? item.session.question_type === 'definition'
          ? '释义单选'
          : '完形选词'
        : realModeLabel(item.session.mode, item.session.year));

    return (
      <Pressable
        key={`${item.kind}-${item.session.id}`}
        onPress={() =>
          isAi ? handleRedo(item.session) : handleViewReal(item.session)
        }
        style={({ pressed }) => [
          styles.sessionCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outline,
            borderRadius: radius.lg,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.sessionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: typography.bodyLg.size, fontWeight: '600', color: colors.onSurface }}>
              {formatDate(createdAt)}
            </Text>
            <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant, marginTop: 2 }}>
              {label}
              {' · '}{total} 题 · 上次答对 {correctCount} 题
            </Text>
          </View>
          <View style={styles.scoreCol}>
            <Text style={[styles.sessionScore, { color: getAccuracyColor(accuracy) }]}>
              {Math.round(accuracy * 100)}%
            </Text>
            <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant, marginTop: 1 }}>
              {correctCount}/{total}
            </Text>
          </View>
        </View>
        <View style={styles.sessionFooter}>
          <Pressable
            onPress={() => handleDelete(item.kind, item.session.id)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: pressed ? colors.errorContainer : 'transparent' },
            ]}
          >
            <AppIcon name="delete-outline" size={16} color={colors.tertiary} />
            <Text style={{ fontSize: typography.caption.size, color: colors.tertiary, marginLeft: 4 }}>删除</Text>
          </Pressable>
          <View style={styles.redoRow}>
            <Text style={{ fontSize: typography.caption.size, color: colors.primary, fontWeight: '600' }}>
              {isAi ? '重做' : '查看回顾'}
            </Text>
            <AppIcon name="chevron-right" size={16} color={colors.primary} />
          </View>
        </View>
      </Pressable>
    );
  };

  if (items.length === 0) {
    const realOnly = filter === 'real';
    return (
      <View style={[styles.container, { paddingTop: spacing.xl }]}>
        {/* 空态下也保留筛选 chips，方便直接切走 */}
        <View style={styles.chipRow}>
          {FILTERS.map(f => renderChip(f))}
        </View>
        <EmptyState
          icon={realOnly ? 'book-open-page-variant' : 'clipboard-text-multiple'}
          title={realOnly ? '暂无真题记录' : '暂无练习记录'}
          description={
            realOnly
              ? '完成真题练习后，可在此回顾成绩与逐题解析。'
              : '完成 AI 出题或真题练习后，可在此回顾历史成绩与重做。'
          }
          actionLabel={realOnly ? '去做真题练习' : '去做一组练习'}
          onAction={() =>
            realOnly ? navigation.navigate('RealExamList') : navigation.navigate('ExamSetup')
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        <View style={styles.chipRow}>
          {FILTERS.map(f => renderChip(f))}
        </View>
        {items.map(renderRow)}

        <View style={{ marginTop: spacing.lg }}>
          {filter === 'real' ? (
            <AppButton
              title="去做真题练习"
              onPress={() => navigation.navigate('RealExamList')}
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={<AppIcon name="book-open-page-variant" size={20} color={colors.primary} />}
            />
          ) : (
            <AppButton
              title="再做一组练习"
              onPress={() => navigation.navigate('ExamSetup')}
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={<AppIcon name="plus" size={20} color={colors.primary} />}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  sessionCard: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  scoreCol: {
    alignItems: 'flex-end',
  },
  sessionScore: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  redoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
}));
