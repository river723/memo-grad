import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { Word, StudyRecord, WeeklyStudyTrend } from '../types';
import { format } from 'date-fns';

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
  difficultWordIds: number[];
  difficultWordCount: number;
};

type SuggestionRoute = 'Study' | 'AddWord' | 'WrongQuestionReview' | 'ExamSetup';

type TodaySuggestion = {
  title: string;
  description: string;
  actionLabel: string;
  icon: string;
  routeName: SuggestionRoute;
  params?: { wordIds?: number[] };
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
};

const DEFAULT_SUGGESTION: TodaySuggestion = {
  title: '保持学习节奏',
  description: '今天暂无固定计划，也可以先背几个单词保持状态。',
  actionLabel: '开始背诵',
  icon: 'book-open-variant',
  routeName: 'Study',
};

const getDifficultWordIds = (words: Word[], records: StudyRecord[]) => {
  const recordsByWord = new Map<number, StudyRecord[]>();

  records.forEach(record => {
    const current = recordsByWord.get(record.word_id) || [];
    current.push(record);
    recordsByWord.set(record.word_id, current);
  });

  return words
    .map(word => {
      if (typeof word.id !== 'number') return null;

      const wordRecords = recordsByWord.get(word.id) || [];
      const totalCount = wordRecords.length;
      const correctCount = wordRecords.filter(record => record.result === 1).length;
      const correctRate = totalCount > 0 ? correctCount / totalCount : 0;

      return { wordId: word.id, totalCount, correctRate };
    })
    .filter((item): item is { wordId: number; totalCount: number; correctRate: number } => {
      return item !== null && item.totalCount > 0 && item.correctRate < 0.5;
    })
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 5)
    .map(item => item.wordId);
};

const buildTodaySuggestion = (stats: TodayStats): TodaySuggestion => {
  if (stats.totalWords === 0) {
    return {
      title: '先添加生词',
      description: '生词本还是空的，先添加几个考研词开始吧。',
      actionLabel: '添加生词',
      icon: 'plus',
      routeName: 'AddWord',
    };
  }

  if (stats.todayPending > 0) {
    return {
      title: `今日还有 ${stats.todayPending} 个生词待学习`,
      description: `其中 ${stats.newPending} 个新词、${stats.reviewPending} 个复习词，建议先完成今日计划。`,
      actionLabel: '继续学习',
      icon: 'book-open-variant',
      routeName: 'Study',
    };
  }

  if (stats.todayStudyCount >= 3 && stats.accuracy < 0.6) {
    const hasDifficultWords = stats.difficultWordIds.length > 0;
    return {
      title: '今天正确率偏低',
      description: `当前正确率约 ${Math.round(stats.accuracy * 100)}%，建议先复习错词和困难词。`,
      actionLabel: hasDifficultWords ? '强化复习' : '继续学习',
      icon: hasDifficultWords ? 'refresh' : 'book-open-variant',
      routeName: 'Study',
      params: hasDifficultWords ? { wordIds: stats.difficultWordIds } : undefined,
    };
  }

  if (stats.wrongQuestionCount > 0) {
    return {
      title: `错题本有 ${stats.wrongQuestionCount} 道题待复盘`,
      description: '趁热复盘错题，可以减少重复犯错。',
      actionLabel: '复习错题',
      icon: 'alert-circle-outline',
      routeName: 'WrongQuestionReview',
    };
  }

  if (stats.difficultWordCount > 0) {
    return {
      title: `有 ${stats.difficultWordCount} 个困难词待强化`,
      description: '这些词历史正确率偏低，建议单独练一轮。',
      actionLabel: '强化复习',
      icon: 'refresh',
      routeName: 'Study',
      params: { wordIds: stats.difficultWordIds },
    };
  }

  if (stats.todayTotal > 0 && stats.todayPending === 0) {
    return {
      title: '今日任务已完成',
      description: '学习节奏不错，可以做一组考题巩固一下。',
      actionLabel: '考题练习',
      icon: 'pencil',
      routeName: 'ExamSetup',
    };
  }

  return DEFAULT_SUGGESTION;
};

export default function HomeScreen() {
  const navigation = useAppNavigation();
  const [todayStats, setTodayStats] = useState<TodayStats>(DEFAULT_TODAY_STATS);
  const [todaySuggestion, setTodaySuggestion] = useState<TodaySuggestion>(DEFAULT_SUGGESTION);
  const [recentWords, setRecentWords] = useState<Word[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyStudyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [allWords, allPlans, todayRecords, allRecords, wrongQuestions] = await Promise.all([
        StorageService.getWords(),
        StorageService.getStudyPlans(),
        StorageService.getStudyRecordsByDate(today),
        StorageService.getStudyRecords(),
        StorageService.getWrongQuestions(),
      ]);

      const todayPlans = allPlans.filter(plan => plan.plan_date === today);
      const todayCompleted = todayPlans.filter(plan => plan.completed).length;
      const todayPendingPlans = todayPlans.filter(plan => !plan.completed);
      const todayPending = todayPendingPlans.length;
      const todayCorrectCount = todayRecords.filter(record => record.result === 1).length;
      const accuracy = todayRecords.length > 0
        ? todayCorrectCount / todayRecords.length
        : 0;
      const difficultWordIds = getDifficultWordIds(allWords, allRecords);

      const nextStats: TodayStats = {
        totalWords: allWords.length,
        todayTotal: todayPlans.length,
        todayPending,
        todayCompleted,
        newPending: todayPendingPlans.filter(plan => plan.plan_type === 'new').length,
        reviewPending: todayPendingPlans.filter(plan => plan.plan_type === 'review').length,
        todayStudyCount: todayRecords.length,
        accuracy,
        wrongQuestionCount: wrongQuestions.length,
        difficultWordIds,
        difficultWordCount: difficultWordIds.length,
      };

      setTodayStats(nextStats);
      setTodaySuggestion(buildTodaySuggestion(nextStats));

      // 加载最近添加的单词
      const words = [...allWords]
        .sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 8);
      setRecentWords(words);

      // 加载一周趋势
      const studyPlanService = new StudyPlanService();
      const stats = await studyPlanService.calculateStudyStats();
      setWeeklyTrend(stats.weeklyTrend || []);
    } catch (e) {
      console.error('加载仪表板数据失败:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const getProgressColor = (rate: number) => {
    if (rate >= 0.8) return '#4CAF50';
    if (rate >= 0.6) return '#FF9800';
    return '#F44336';
  };

  const totalPlanned = todayStats.todayTotal;
  const progress = totalPlanned > 0 ? todayStats.todayCompleted / totalPlanned : 0;
  const accuracyPercent = Math.round(todayStats.accuracy * 100);

  const handleSuggestionPress = () => {
    const { routeName, params } = todaySuggestion;
    switch (routeName) {
      case 'Study':
        navigation.navigate('Study', params);
        break;
      case 'AddWord':
        navigation.navigate('AddWord');
        break;
      case 'WrongQuestionReview':
        navigation.navigate('WrongQuestionReview');
        break;
      case 'ExamSetup':
        navigation.navigate('ExamSetup');
        break;
    }
  };

  const weeklyStudiedWordCount = weeklyTrend.reduce((sum, day) => sum + day.studiedWordCount, 0);
  const weeklyStudyCount = weeklyTrend.reduce((sum, day) => sum + day.studyCount, 0);
  const avgDailyStudyCount = weeklyTrend.length > 0 ? Math.round(weeklyStudyCount / weeklyTrend.length) : 0;

  // 首次加载且尚无数据时显示骨架加载
  const showSpinner =
    loading && todayStats.totalWords === 0 && recentWords.length === 0 && !error;
  const isEmpty = !loading && !error && todayStats.totalWords === 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {showSpinner && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#1976D2" />
            <Text style={styles.centerStateText}>加载中…</Text>
          </View>
        )}

        {error && todayStats.totalWords === 0 && recentWords.length === 0 && (
          <View style={styles.centerState}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.centerStateText}>数据加载失败</Text>
            <Button mode="contained" onPress={loadDashboardData} style={styles.centerStateButton}>
              重试
            </Button>
          </View>
        )}

        {/* 空状态：引导首次添加生词 */}
        {isEmpty && (
          <Card style={styles.card}>
            <Card.Content style={styles.onboarding}>
              <Text style={styles.emptyIcon}>🌱</Text>
              <Text style={styles.onboardingTitle}>添加你的第一个生词</Text>
              <Text style={styles.onboardingDesc}>
                添加 → 学习 → 复习 → 掌握。按艾宾浩斯曲线自动安排复习，让记忆更牢固。
              </Text>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('AddWord')}
                icon="plus"
                style={styles.onboardingButton}
              >
                添加生词
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* 常规内容 */}
        {!showSpinner && !isEmpty && !(error && todayStats.totalWords === 0) && (
          <>
            {error && (
              <Card style={[styles.card, styles.errorBanner]}>
                <Card.Content>
                  <Text style={styles.errorBannerText}>部分数据加载失败，下拉重试</Text>
                </Card.Content>
              </Card>
            )}

            {/* 1. 智能建议英雄卡（置顶） */}
            <Card style={[styles.card, styles.suggestionCard]}>
              <Card.Content>
                <Text style={styles.reminderTitle}>📚 今日建议</Text>
                <Text style={styles.suggestionSubtitle}>{todaySuggestion.title}</Text>
                <Text style={styles.reminderText}>{todaySuggestion.description}</Text>
                <Button
                  mode="contained"
                  onPress={handleSuggestionPress}
                  style={styles.suggestionButton}
                  icon={todaySuggestion.icon}
                >
                  {todaySuggestion.actionLabel}
                </Button>
              </Card.Content>
            </Card>

            {/* 2. 今日进度（精简为一行 + 进度条） */}
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>
                    待学 {todayStats.todayPending} · 已完成 {todayStats.todayCompleted} · 正确率 {accuracyPercent}%
                  </Text>
                  <Text style={[styles.progressPercent, { color: getProgressColor(todayStats.accuracy) }]}>
                    {Math.round(progress * 100)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={progress}
                  color="#1976D2"
                  style={styles.progressBar}
                />
                <Text style={styles.progressHint}>
                  {totalPlanned > 0
                    ? `进度 ${todayStats.todayCompleted}/${totalPlanned}`
                    : '今日暂无学习计划，点击下方按钮开始'}
                </Text>
              </Card.Content>
            </Card>

            {/* 3. 主操作 CTA */}
            <Button
              mode="contained"
              onPress={() => navigation.navigate('Study')}
              style={styles.primaryButton}
              icon="book-open-variant"
              labelStyle={styles.primaryButtonLabel}
            >
              开始今日学习
            </Button>

            {/* 4. 待办行（条件渲染，为 0 即隐藏） */}
            {(todayStats.wrongQuestionCount > 0 || todayStats.difficultWordCount > 0) && (
              <View style={styles.pendingRow}>
                {todayStats.wrongQuestionCount > 0 && (
                  <Button
                    mode="outlined"
                    onPress={() => navigation.navigate('WrongQuestionReview')}
                    icon="alert-circle-outline"
                    textColor="#F44336"
                    style={styles.pendingButton}
                  >
                    错题本 ({todayStats.wrongQuestionCount})
                  </Button>
                )}
                {todayStats.difficultWordCount > 0 && (
                  <Button
                    mode="outlined"
                    onPress={() =>
                      navigation.navigate('Study', { wordIds: todayStats.difficultWordIds })
                    }
                    icon="refresh"
                    textColor="#FF9800"
                    style={styles.pendingButton}
                  >
                    强化复习 ({todayStats.difficultWordCount})
                  </Button>
                )}
              </View>
            )}

            {/* 5. 最近添加（横向瓦片，加大点击区） */}
            {recentWords.length > 0 && (
              <Card style={styles.card}>
                <Card.Title
                  title="最近添加"
                  titleStyle={styles.cardTitle}
                  right={() => (
                    <Button
                      onPress={() => navigation.navigate('Main', { screen: 'Words' })}
                      textColor="#1976D2"
                    >
                      查看全部
                    </Button>
                  )}
                />
                <Card.Content>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.recentTiles}>
                      {recentWords.map(word => (
                        <Pressable
                          key={word.id ?? word.word}
                          onPress={() => {
                            if (word.id != null) navigation.navigate('WordDetail', { wordId: word.id });
                          }}
                        >
                          <Surface style={styles.wordTile} elevation={1}>
                            <Text style={styles.wordTileText}>{word.word}</Text>
                            <Text style={styles.wordTileDifficulty}>
                              {'★'.repeat(Math.max(1, Math.min(5, word.difficulty)))}
                            </Text>
                          </Surface>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </Card.Content>
              </Card>
            )}

            {/* 6. 一周趋势（折叠为摘要 + 箭头） */}
            <Card
              style={[styles.card, styles.lastCard]}
              onPress={() => navigation.navigate('Stats')}
            >
              <Card.Content style={styles.trendRow}>
                <View style={styles.trendSummary}>
                  <Text style={styles.trendMetricValue}>{weeklyStudiedWordCount}</Text>
                  <Text style={styles.trendMetricLabel}>本周学习词数</Text>
                </View>
                <View style={styles.trendSummary}>
                  <Text style={styles.trendMetricValue}>{avgDailyStudyCount}</Text>
                  <Text style={styles.trendMetricLabel}>日均次数</Text>
                </View>
                <IconButton icon="chevron-right" size={24} iconColor="#1976D2" />
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  lastCard: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  centerStateText: {
    fontSize: 15,
    color: '#666',
    marginTop: 12,
  },
  centerStateButton: {
    marginTop: 16,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    elevation: 1,
  },
  errorBannerText: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
  },
  onboarding: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  onboardingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 10,
  },
  onboardingDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  onboardingButton: {
    paddingHorizontal: 8,
  },
  suggestionCard: {
    elevation: 4,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  suggestionSubtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 6,
  },
  reminderText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  suggestionButton: {
    marginTop: 12,
    borderRadius: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: '#333',
    flexShrink: 1,
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  progressHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  primaryButton: {
    marginBottom: 16,
    paddingVertical: 6,
  },
  primaryButtonLabel: {
    fontSize: 16,
  },
  pendingRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  pendingButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  recentTiles: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 4,
  },
  wordTile: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 56,
    justifyContent: 'center',
  },
  wordTileText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
  },
  wordTileDifficulty: {
    fontSize: 11,
    color: '#FF9800',
    marginTop: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  trendSummary: {
    alignItems: 'center',
    flex: 1,
  },
  trendMetricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  trendMetricLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});

