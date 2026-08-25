import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppIcon, { type IconName } from '../components/ds/AppIcon';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import { spring, timingSlow } from '../theme/motion';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import AutoWordService from '../services/AutoWordService';
import { useToast } from '../components/ds/Toast';
import { Word, WeeklyStudyTrend } from '../types';
import { format } from 'date-fns';
import { useAnnouncements } from '../providers/AnnouncementProvider';
import AnnouncementBanner from '../components/AnnouncementBanner';
import AppButton from '../components/ds/AppButton';
import StatStrip from '../components/ds/StatStrip';
import SectionHeader from '../components/ds/SectionHeader';
import EmptyState from '../components/ds/EmptyState';
import DifficultyBadge from '../components/ds/DifficultyBadge';

type TodayStats = {
  totalWords: number;
  todayTotal: number;
  todayPending: number;
  todayCompleted: number;
  newPending: number;
  reviewPending: number;
  todayStudyCount: number;
  accuracy: number;
  wrongQuestionCount: number;
  difficultWordIds: string[];
  difficultWordCount: number;
  unstudiedNewWordCount: number;
};

type SuggestionRoute =
  | { tab: 'Home'; screen: 'Study'; params?: { wordIds?: string[] } }
  | { tab: 'Home'; screen: 'AddWord' }
  | { tab: 'Practice'; screen: 'WrongQuestionReview' }
  | { tab: 'Practice'; screen: 'ExamSetup' };

type TodaySuggestion = {
  title: string;
  description: string;
  actionLabel: string;
  icon: IconName;
  route: SuggestionRoute;
};

const DEFAULT_TODAY_STATS: TodayStats = {
  totalWords: 0,
  todayTotal: 0,
  todayPending: 0,
  todayCompleted: 0,
  newPending: 0,
  reviewPending: 0,
  todayStudyCount: 0,
  accuracy: 0,
  wrongQuestionCount: 0,
  difficultWordIds: [],
  difficultWordCount: 0,
  unstudiedNewWordCount: 0,
};

const DEFAULT_SUGGESTION: TodaySuggestion = {
  title: '保持学习节奏',
  description: '今天暂无固定计划，也可以先背几个单词保持状态。',
  actionLabel: '开始背诵',
  icon: 'book-open-page-variant',
  route: { tab: 'Home', screen: 'Study' },
};

const getDifficultWordIds = (words: Word[], records: any[]): string[] => {
  const recordsByWord = new Map<string, any[]>();
  records.forEach((r) => {
    const arr = recordsByWord.get(r.word_id) || [];
    arr.push(r);
    recordsByWord.set(r.word_id, arr);
  });
  return words
    .map((w) => {
      if (!w.id) return null;
      const wordRecords = recordsByWord.get(w.id) || [];
      const total = wordRecords.length;
      const correct = wordRecords.filter((r) => r.result === 1).length;
      const rate = total > 0 ? correct / total : 0;
      return { wordId: w.id, total, rate };
    })
    .filter((x): x is { wordId: string; total: number; rate: number } =>
      x !== null && x.total > 0 && x.rate < 0.5)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5)
    .map((x) => x.wordId);
};

const needsDifficultWords = (stats: TodayStats): boolean => {
  if (stats.totalWords === 0) return false;
  if (stats.todayPending > 0) return false;
  const lowAccuracy = stats.todayStudyCount >= 3 && stats.accuracy < 0.6;
  return lowAccuracy || stats.wrongQuestionCount === 0;
};

const buildTodaySuggestion = (stats: TodayStats): TodaySuggestion => {
  if (stats.totalWords === 0) {
    return {
      title: '先添加生词',
      description: '生词本还是空的，先添加几个考研词开始吧。',
      actionLabel: '添加生词',
      icon: 'plus-box',
      route: { tab: 'Home', screen: 'AddWord' },
    };
  }
  if (stats.todayPending > 0) {
    return {
      title: `今日还有 ${stats.todayPending} 个生词`,
      description: `${stats.newPending} 个新词 · ${stats.reviewPending} 个复习词`,
      actionLabel: '开始学习',
      icon: 'book-open-page-variant',
      route: { tab: 'Home', screen: 'Study' },
    };
  }
  if (stats.todayPending === 0 && stats.unstudiedNewWordCount > 0) {
    const done = stats.todayTotal > 0;
    return {
      title: done ? '今日任务已完成' : '词库还有新词',
      description: done ? '状态不错，再背一批新词继续推进。' : '还有未学过的新词，开始背吧。',
      actionLabel: '继续学习',
      icon: 'book-open-page-variant',
      route: { tab: 'Home', screen: 'Study' },
    };
  }
  if (stats.todayStudyCount >= 3 && stats.accuracy < 0.6) {
    const has = stats.difficultWordIds.length > 0;
    return {
      title: '今天正确率偏低',
      description: `当前约 ${Math.round(stats.accuracy * 100)}%，建议先复习困难词。`,
      actionLabel: has ? '强化复习' : '继续学习',
      icon: has ? 'refresh' : 'book-open-page-variant',
      route: {
        tab: 'Home',
        screen: 'Study',
        params: has ? { wordIds: stats.difficultWordIds } : undefined,
      },
    };
  }
  if (stats.wrongQuestionCount > 0) {
    return {
      title: `${stats.wrongQuestionCount} 道错题待复盘`,
      description: '趁热复盘，减少重复犯错。',
      actionLabel: '复习错题',
      icon: 'alert-circle-outline',
      route: { tab: 'Practice', screen: 'WrongQuestionReview' },
    };
  }
  if (stats.difficultWordCount > 0) {
    return {
      title: `${stats.difficultWordCount} 个困难词待强化`,
      description: '这些词历史正确率偏低。',
      actionLabel: '强化复习',
      icon: 'refresh',
      route: { tab: 'Home', screen: 'Study', params: { wordIds: stats.difficultWordIds } },
    };
  }
  if (stats.todayTotal > 0 && stats.todayPending === 0) {
    return {
      title: '今日任务已完成',
      description: '学习节奏不错，可以做一组考题巩固。',
      actionLabel: 'AI出题练习',
      icon: 'puzzle',
      route: { tab: 'Practice', screen: 'ExamSetup' },
    };
  }
  return DEFAULT_SUGGESTION;
};

export default function HomeScreen() {
  const navigation = useAppNavigation();
  const { colors, dark: _ } = useAppTheme();
  const typography = colors.typography;
  const toast = useToast();
  const [todayStats, setTodayStats] = useState<TodayStats>(DEFAULT_TODAY_STATS);
  const [todaySuggestion, setTodaySuggestion] = useState<TodaySuggestion>(DEFAULT_SUGGESTION);
  const [recentWords, setRecentWords] = useState<Word[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyStudyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 自动配词开关（决定「再来一组」入口是否显示）+ 补词进行中状态
  const [autoAddEnabled, setAutoAddEnabled] = useState(true);
  const [refilling, setRefilling] = useState(false);

  // 进场动效
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(12)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // 自动配词开关状态（控制首页「再来一组」入口是否显示）
      const settings = await StorageService.getSettings();
      setAutoAddEnabled(settings.autoAddNewWords !== false);
      // 每日自动配词：按考频把生词本补足到「每日新词数」（当天只跑一次）
      const autoAdded = await AutoWordService.fillTodayIfNeeded();
      if (autoAdded > 0) {
        toast.info(`已按考频自动加入 ${autoAdded} 个新词`);
      }
      const today = format(new Date(), 'yyyy-MM-dd');
      const [allWords, allPlans, todayRecords, allRecords, wrongQuestions] = await Promise.all([
        StorageService.getWords(),
        StorageService.getStudyPlans(),
        StorageService.getStudyRecordsByDate(today),
        StorageService.getStudyRecords(),
        StorageService.getWrongQuestions(),
      ]);
      const todayPlans = allPlans.filter((p) => p.plan_date === today);
      const todayCompleted = todayPlans.filter((p) => p.completed).length;
      const todayPendingPlans = todayPlans.filter((p) => !p.completed);
      const todayPending = todayPendingPlans.length;
      const todayCorrectCount = todayRecords.filter((r) => r.result === 1).length;
      const accuracy = todayRecords.length > 0 ? todayCorrectCount / todayRecords.length : 0;
      const studiedWordIds = new Set(allRecords.map((r) => r.word_id));
      const unstudiedNewWordCount = allWords.filter((w) => !studiedWordIds.has(w.id)).length;
      const baseStats: TodayStats = {
        totalWords: allWords.length,
        todayTotal: todayPlans.length,
        todayPending,
        todayCompleted,
        newPending: todayPendingPlans.filter((p) => p.plan_type === 'new').length,
        reviewPending: todayPendingPlans.filter((p) => p.plan_type === 'review').length,
        todayStudyCount: todayRecords.length,
        accuracy,
        wrongQuestionCount: wrongQuestions.length,
        difficultWordIds: [],
        difficultWordCount: 0,
        unstudiedNewWordCount,
      };
      let nextStats = baseStats;
      if (needsDifficultWords(baseStats)) {
        const ids = getDifficultWordIds(allWords, allRecords);
        nextStats = { ...baseStats, difficultWordIds: ids, difficultWordCount: ids.length };
      }
      setTodayStats(nextStats);
      setTodaySuggestion(buildTodaySuggestion(nextStats));
      const sorted = [...allWords]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 8);
      setRecentWords(sorted);
      const svc = new StudyPlanService();
      const stats = await svc.calculateStudyStats();
      setWeeklyTrend(stats.weeklyTrend || []);
    } catch (e) {
      console.error('加载仪表板数据失败:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  // 每次数据更新时跑进场动画
  useEffect(() => {
    if (!loading) {
      heroOpacity.setValue(0);
      heroTranslate.setValue(12);
      progressAnim.setValue(0);
      Animated.parallel([
        Animated.spring(heroOpacity, { toValue: 1, ...spring, useNativeDriver: true }),
        Animated.spring(heroTranslate, { toValue: 0, ...spring, useNativeDriver: true }),
        Animated.timing(progressAnim, { toValue: 1, ...timingSlow, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();
    }
  }, [loading, heroOpacity, heroTranslate, progressAnim]);

  const { refresh: refreshAnnouncements } = useAnnouncements();
  useFocusEffect(
    useCallback(() => {
      refreshAnnouncements();
    }, [refreshAnnouncements])
  );

  const totalPlanned = todayStats.todayTotal;
  const progress = totalPlanned > 0 ? todayStats.todayCompleted / totalPlanned : 0;
  // 英雄卡"还能学多少"：优先看当日计划剩余；计划还没建（自动配词/手工加词后
  // 尚未进学习页）时看生词本未学存量，避免刚补完词英雄卡仍显示 0。
  const availableCount = Math.max(todayStats.todayPending, todayStats.unstudiedNewWordCount);
  const accuracyPercent = Math.round(todayStats.accuracy * 100);
  const weeklyStudied = weeklyTrend.reduce((s, d) => s + d.studiedWordCount, 0);
  const weeklySessions = weeklyTrend.reduce((s, d) => s + d.studyCount, 0);
  const avgDaily = weeklyTrend.length > 0 ? Math.round(weeklySessions / weeklyTrend.length) : 0;

  const handleSuggestionPress = () => {
    const { route } = todaySuggestion;
    if (route.tab !== 'Home') {
      navigation.navigate('Main' as any, {
        screen: route.tab as any,
        params: { screen: route.screen, params: 'params' in route ? route.params : undefined } as any,
      });
      return;
    }
    if (route.screen === 'AddWord') {
      navigation.navigate('AddWord' as any);
    } else {
      navigation.navigate('Study' as any, route.params as any);
    }
  };

  // 追平态（当日计划已清空且生词本无未学存量）时提供「再来一组」：
  // 否则主 CTA 会指向 AI 出题/错题等非学习入口，首页就没有开新组的路了。
  const canStartAnotherGroup =
    !loading &&
    autoAddEnabled &&
    todayStats.todayPending === 0 &&
    todayStats.unstudiedNewWordCount === 0;

  const handleAnotherGroup = async () => {
    setRefilling(true);
    try {
      // 强制补充跳过日期守卫；成功后进学习页，新词由 loadStudyWords 常规路径捞起
      const added = await AutoWordService.fillTodayIfNeeded({ force: true });
      if (added > 0) {
        toast.info(`已自动补充 ${added} 个新词`);
        navigation.navigate('Study' as any);
      } else {
        toast.info('词库已全部学完，没有更多新词了');
      }
    } finally {
      setRefilling(false);
    }
  };

  const showSpinner = loading && todayStats.totalWords === 0 && recentWords.length === 0 && !error;
  const isEmpty = !loading && !error && todayStats.totalWords === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AnnouncementBanner />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
        {showSpinner ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 12, color: colors.onSurfaceVariant, fontSize: typography.body.size }}>加载中…</Text>
          </View>
        ) : isEmpty ? (
          <View style={{ paddingTop: spacing['3xl'] }}>
            <EmptyState
              icon="book-open-page-variant"
              title="添加你的第一个生词"
              description="添加 → 学习 → 复习 → 掌握。按艾宾浩斯曲线自动安排复习，让记忆更牢固。"
              actionLabel="添加生词"
              onAction={() => navigation.navigate('AddWord' as any)}
            />
          </View>
        ) : (
          <>
            {/* === Hero 段 === */}
            <Animated.View
              style={[
                styles.hero,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radius.xl,
                  opacity: heroOpacity,
                  transform: [{ translateY: heroTranslate }],
                },
                colors.shadow.card,
              ]}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: typography.caption.size, letterSpacing: 0.6 }}>
                  {availableCount > 0 ? '今日待学' : todayStats.todayTotal > 0 ? '今日任务' : '今日'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text
                    style={{
                      color: colors.onPrimary,
                      fontSize: typography.numeralXl.size,
                      lineHeight: typography.numeralXl.lineHeight,
                      fontWeight: '700',
                      letterSpacing: -1,
                    }}
                  >
                    {availableCount > 0 ? availableCount : todayStats.todayCompleted}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodyLg.size, fontWeight: '500' }}>
                    个词
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, marginTop: 2 }}>
                  {todaySuggestion.description}
                </Text>
              </View>
              {/* 墨绿环图（半圆 + 进度弧） */}
              <ProgressRing progress={progress} />
            </Animated.View>

            {/* 主 CTA */}
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              <AppButton
                title={todaySuggestion.actionLabel}
                onPress={handleSuggestionPress}
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<AppIcon name={todaySuggestion.icon} size={20} color={colors.onPrimary} />}
              />
              {todaySuggestion.actionLabel === '继续学习' && todayStats.wrongQuestionCount > 0 && (
                <AppButton
                  title="复习错题"
                  onPress={() =>
                    navigation.navigate('Main' as any, {
                      screen: 'Practice' as any,
                      params: { screen: 'WrongQuestionReview' as any },
                    })
                  }
                  variant="secondary"
                  size="md"
                  fullWidth
                  leftIcon={<MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.primary} />}
                />
              )}
              {canStartAnotherGroup && (
                <AppButton
                  title="再来一组"
                  onPress={handleAnotherGroup}
                  variant="secondary"
                  size="md"
                  fullWidth
                  loading={refilling}
                  leftIcon={<AppIcon name="refresh" size={20} color={colors.primary} />}
                />
              )}
            </View>

            {/* === 第二段：3 metric 横向条 === */}
            <View style={{ marginTop: spacing.xl }}>
              <StatStrip
                metrics={[
                  {
                    value: todayStats.todayCompleted,
                    label: '今日已完成',
                  },
                  {
                    value: `${accuracyPercent}%`,
                    label: '今日正确率',
                    trend: accuracyPercent >= 70 ? 'up' : accuracyPercent >= 50 ? 'flat' : 'down',
                  },
                  {
                    value: avgDaily,
                    label: '日均次数',
                  },
                ]}
              />
            </View>

            {/* progress 细线（隐性） */}
            <Animated.View
              style={{
                marginTop: spacing.md,
                height: 3,
                backgroundColor: colors.outline,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  height: '100%',
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.round(progress * 100)}%`] }),
                  backgroundColor: colors.primary,
                }}
              />
            </Animated.View>

            {/* === 第三段：待办 + 最近添加 === */}
            {(todayStats.wrongQuestionCount > 0 || todayStats.difficultWordCount > 0) && (
              <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
                {todayStats.wrongQuestionCount > 0 && (
                  <Pressable
                    onPress={() =>
                      navigation.navigate('Main' as any, {
                        screen: 'Practice' as any,
                        params: { screen: 'WrongQuestionReview' as any },
                      })
                    }
                    style={({ pressed }) => [
                      styles.todoRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.outline,
                        borderRadius: radius.lg,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.todoIcon, { backgroundColor: colors.status.refunded.bg }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.onSurface, fontSize: typography.bodyLg.size, fontWeight: '600' }}>
                        错题本
                      </Text>
                      <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginTop: 2 }}>
                        {todayStats.wrongQuestionCount} 道错题待复盘
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
                  </Pressable>
                )}
                {todayStats.difficultWordCount > 0 && (
                  <Pressable
                    onPress={() => navigation.navigate('Study' as any, { wordIds: todayStats.difficultWordIds })}
                    style={({ pressed }) => [
                      styles.todoRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.outline,
                        borderRadius: radius.lg,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.todoIcon, { backgroundColor: colors.status.pending.bg }]}>
                      <MaterialCommunityIcons name="refresh" size={20} color={colors.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.onSurface, fontSize: typography.bodyLg.size, fontWeight: '600' }}>
                        困难词
                      </Text>
                      <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginTop: 2 }}>
                        {todayStats.difficultWordCount} 个词历史正确率偏低
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
                  </Pressable>
                )}
              </View>
            )}

            {/* === 第四段：词库快捷入口（常驻） === */}
            <View style={{ marginTop: spacing.xl }}>
              <Pressable
                onPress={() => navigation.navigate('Dictionary' as any)}
                style={({ pressed }) => [
                  styles.todoRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.outline,
                    borderRadius: radius.lg,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={[styles.todoIcon, { backgroundColor: colors.status.active.bg }]}>
                  <MaterialCommunityIcons name="library" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontSize: typography.bodyLg.size, fontWeight: '600' }}>
                    词库
                  </Text>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginTop: 2 }}>
                    浏览全部词库 · 按字母查询单词
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
              </Pressable>
            </View>

            {/* 最近添加（时间线样式） */}
            {recentWords.length > 0 && (
              <View style={{ marginTop: spacing.xl }}>
                <SectionHeader
                  title="最近添加"
                  actionLabel="查看生词本"
                  onAction={() => navigation.navigate('WordList' as any)}
                />
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    borderColor: colors.outline,
                    borderWidth: 1,
                    overflow: 'hidden',
                  }}
                >
                  {recentWords.slice(0, 5).map((w, idx) => (
                    <Pressable
                      key={w.id ?? w.word}
                      onPress={() => w.id != null && navigation.navigate('WordDetail' as any, { wordId: w.id })}
                      style={({ pressed }) => [
                        styles.timelineRow,
                        {
                          borderBottomColor: colors.outline,
                          borderBottomWidth: idx < Math.min(recentWords.length, 5) - 1 ? 1 : 0,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: colors.onSurface,
                            fontSize: typography.bodyLg.size,
                            fontWeight: '600',
                            fontFamily: typography.title ? undefined : undefined,
                          }}
                        >
                          {w.word}
                        </Text>
                        {w.pronunciation_uk || w.pronunciation_us ? (
                          <Text style={{ color: colors.tertiary, fontSize: typography.caption.size, marginTop: 2 }}>
                            {w.pronunciation_uk || w.pronunciation_us}
                          </Text>
                        ) : null}
                      </View>
                      <DifficultyBadge level={w.difficulty || 1} size="sm" />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* 一周趋势摘要（点击进 StatsDetail） */}
            {weeklyTrend.length > 0 && (
              <Pressable
                onPress={() =>
                  navigation.navigate('Main' as any, {
                    screen: 'Stats' as any,
                    params: { screen: 'StatsDetail' as any },
                  })
                }
                style={({ pressed }) => [
                  styles.trendCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.outline,
                    borderRadius: radius.lg,
                    marginTop: spacing.xl,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginBottom: 4 }}>
                    本周学习
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text
                      style={{
                        color: colors.onSurface,
                        fontSize: typography.headline.size,
                        lineHeight: typography.headline.lineHeight,
                        fontWeight: '700',
                      }}
                    >
                      {weeklyStudied}
                    </Text>
                    <Text style={{ color: colors.tertiary, fontSize: typography.body.size }}>词</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginBottom: 4 }}>
                    日均次数
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text
                      style={{
                        color: colors.onSurface,
                        fontSize: typography.headline.size,
                        lineHeight: typography.headline.lineHeight,
                        fontWeight: '700',
                      }}
                    >
                      {avgDaily}
                    </Text>
                    <Text style={{ color: colors.tertiary, fontSize: typography.body.size }}>次</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
              </Pressable>
            )}

            {error && (
              <Text style={{ color: colors.danger, textAlign: 'center', marginTop: spacing.lg, fontSize: typography.bodySm.size }}>
                部分数据加载失败，请稍后重试
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// === 墨绿环图（纯 View + transform，零依赖） ===
const ProgressRing: React.FC<{ progress: number }> = ({ progress }) => {
  const { colors } = useAppTheme();
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'rgba(255,255,255,0.18)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'transparent',
          borderTopColor: colors.onPrimary,
          borderRightColor: progress > 0.25 ? colors.onPrimary : 'transparent',
          borderBottomColor: progress > 0.5 ? colors.onPrimary : 'transparent',
          borderLeftColor: progress > 0.75 ? colors.onPrimary : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }}
      />
      <Text
        style={{
          color: colors.onPrimary,
          fontSize: 16,
          fontWeight: '700',
          letterSpacing: -0.3,
        }}
      >
        {Math.round(progress * 100)}%
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 140,
    gap: 16,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderWidth: 1,
  },
  todoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingLeft: 18,
    gap: 12,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
});
