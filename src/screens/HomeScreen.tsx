import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Chip,
  Surface,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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

type TodaySuggestion = {
  title: string;
  description: string;
  actionLabel: string;
  icon: string;
  routeName: string;
  params?: any;
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
  const navigation = useNavigation<any>();
  const [todayStats, setTodayStats] = useState<TodayStats>(DEFAULT_TODAY_STATS);
  const [todaySuggestion, setTodaySuggestion] = useState<TodaySuggestion>(DEFAULT_SUGGESTION);
  const [recentWords, setRecentWords] = useState<Word[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyStudyTrend[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      console.log('开始加载仪表板数据...');

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
        .slice(0, 5);
      setRecentWords(words);

      // 加载一周趋势
      const studyPlanService = new StudyPlanService();
      const stats = await studyPlanService.calculateStudyStats();
      setWeeklyTrend(stats.weeklyTrend || []);

      console.log('仪表板数据加载完成');
    } catch (error) {
      console.error('加载仪表板数据失败:', error);
      setTodayStats(DEFAULT_TODAY_STATS);
      setTodaySuggestion(DEFAULT_SUGGESTION);
      setRecentWords([]);
      setWeeklyTrend([]);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 0.8) return '#4CAF50';
    if (progress >= 0.6) return '#FF9800';
    return '#F44336';
  };

  const totalPlanned = todayStats.todayTotal;
  const progress = totalPlanned > 0 ? todayStats.todayCompleted / totalPlanned : 0;

  const handleSuggestionPress = () => {
    if (todaySuggestion.params) {
      navigation.navigate(todaySuggestion.routeName, todaySuggestion.params);
      return;
    }

    navigation.navigate(todaySuggestion.routeName);
  };

  const weeklyStudyCount = weeklyTrend.reduce((sum, day) => sum + day.studyCount, 0);
  const weeklyStudiedWordCount = weeklyTrend.reduce((sum, day) => sum + day.studiedWordCount, 0);
  const weeklyCorrectCount = weeklyTrend.reduce((sum, day) => sum + day.correctCount, 0);
  const weeklyPlannedCount = weeklyTrend.reduce((sum, day) => sum + day.plannedCount, 0);
  const weeklyCompletedCount = weeklyTrend.reduce((sum, day) => sum + day.completedCount, 0);
  const weeklyAccuracy = weeklyStudyCount > 0 ? weeklyCorrectCount / weeklyStudyCount : null;
  const weeklyCompletionRate = weeklyPlannedCount > 0 ? weeklyCompletedCount / weeklyPlannedCount : null;
  const maxStudyCount = Math.max(...weeklyTrend.map(day => day.studyCount), 1);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* 今日学习概览 - 精简为 3 个指标 */}
        <Card style={styles.card}>
          <Card.Title title="今日学习" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: todayStats.todayPending > 0 ? '#FF9800' : '#1976D2' }]}>
                  {todayStats.todayPending}
                </Text>
                <Text style={styles.statLabel}>待学习</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{todayStats.todayCompleted}</Text>
                <Text style={styles.statLabel}>已完成</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: getProgressColor(todayStats.accuracy) }]}>
                  {Math.round(todayStats.accuracy * 100)}%
                </Text>
                <Text style={styles.statLabel}>正确率</Text>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {totalPlanned > 0
                    ? `进度 ${todayStats.todayCompleted}/${totalPlanned}`
                    : '今日暂无学习计划'}
                </Text>
                <Text style={styles.progressPercent}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>
              <ProgressBar
                progress={progress}
                color="#1976D2"
                style={styles.progressBar}
              />
            </View>
          </Card.Content>
        </Card>

        {/* 核心操作区 - 3 个主要入口 */}
        <Card style={styles.card}>
          <Card.Title title="快速开始" titleStyle={styles.cardTitle} />
          <Card.Content>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('Study' as never)}
              style={styles.primaryButton}
              icon="book-open-variant"
              labelStyle={styles.primaryButtonLabel}
            >
              开始背诵
            </Button>
            <View style={styles.actionRow}>
              <Button
                mode="contained-tonal"
                onPress={() => navigation.navigate('ExamSetup' as never)}
                style={styles.actionButton}
                icon="pencil"
              >
                考题练习
              </Button>
              <Button
                mode="contained-tonal"
                onPress={() => navigation.navigate('ArticleList' as never)}
                style={styles.actionButton}
                icon="file-document"
              >
                趣味文章
              </Button>
            </View>

            {/* 次要入口 */}
            <View style={styles.secondaryRow}>
              <Button
                mode="text"
                compact
                onPress={() => navigation.navigate('AddWord' as never)}
                icon="plus"
                textColor="#1976D2"
              >
                添加生词
              </Button>
              <Button
                mode="text"
                compact
                onPress={() => navigation.navigate('WrongQuestionReview' as never)}
                icon="alert-circle-outline"
                textColor="#1976D2"
              >
                错题本
              </Button>
              <Button
                mode="text"
                compact
                onPress={() => navigation.navigate('ExamHistory' as never)}
                icon="history"
                textColor="#1976D2"
              >
                练习历史
              </Button>
              <Button
                mode="text"
                compact
                onPress={() => navigation.navigate('Stats' as never)}
                icon="chart-bar"
                textColor="#1976D2"
              >
                统计
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* 一周学习趋势 */}
        <Card style={styles.card}>
          <Card.Title title="一周学习趋势" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.trendSummary}>
              <View style={styles.trendMetric}>
                <Text style={styles.trendMetricValue}>{weeklyStudiedWordCount}</Text>
                <Text style={styles.trendMetricLabel}>学习单词</Text>
              </View>
              <View style={styles.trendMetric}>
                <Text style={[styles.trendMetricValue, { color: weeklyAccuracy === null ? '#9E9E9E' : getProgressColor(weeklyAccuracy) }]}>
                  {weeklyAccuracy === null ? '--' : `${Math.round(weeklyAccuracy * 100)}%`}
                </Text>
                <Text style={styles.trendMetricLabel}>平均正确率</Text>
              </View>
              <View style={styles.trendMetric}>
                <Text style={[styles.trendMetricValue, { color: weeklyCompletionRate === null ? '#9E9E9E' : getProgressColor(weeklyCompletionRate) }]}>
                  {weeklyCompletionRate === null ? '--' : `${Math.round(weeklyCompletionRate * 100)}%`}
                </Text>
                <Text style={styles.trendMetricLabel}>计划完成</Text>
              </View>
            </View>

            <View style={styles.weeklyChart}>
              {weeklyTrend.map(day => {
                const accuracyColor = day.accuracy === null ? '#BDBDBD' : getProgressColor(day.accuracy);
                const studyRatio = day.studyCount > 0 ? day.studyCount / maxStudyCount : 0;
                const completionText = day.completionRate === null
                  ? '无计划'
                  : `完${Math.round(day.completionRate * 100)}%`;

                return (
                  <View key={day.date} style={styles.chartItem}>
                    <Surface
                      style={[
                        styles.chartBar,
                        {
                          height: Math.max(studyRatio * 60, 4),
                          backgroundColor: accuracyColor,
                        },
                      ]}
                    >
                      <View />
                    </Surface>
                    <Text style={styles.chartLabel}>{day.dayLabel}</Text>
                    <Text style={styles.chartValue}>{day.studyCount}次</Text>
                    <Text style={[styles.chartSubValue, { color: accuracyColor }]}>
                      {day.accuracy === null ? '--' : `${Math.round(day.accuracy * 100)}%`}
                    </Text>
                    <Text style={styles.chartPlanValue}>{completionText}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.trendHint}>柱高代表学习量，颜色代表正确率，底部显示计划完成率。</Text>
          </Card.Content>
        </Card>

        {/* 最近添加的单词 */}
        <Card style={styles.card}>
          <Card.Title
            title="最近添加"
            titleStyle={styles.cardTitle}
            right={() => (
              <Button onPress={() => navigation.navigate('单词本' as never)}>
                查看全部
              </Button>
            )}
          />
          <Card.Content>
            <View style={styles.recentWords}>
              {recentWords.map((word, index) => (
                <Chip
                  key={index}
                  mode="outlined"
                  onPress={() => navigation.navigate('WordDetail' as never, { wordId: word.id } as never)}
                  style={styles.wordChip}
                >
                  {word.word}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* 今日建议 */}
        <Card style={[styles.card, styles.lastCard]}>
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
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  lastCard: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressSection: {
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: '#666',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  primaryButton: {
    marginBottom: 12,
    paddingVertical: 6,
  },
  primaryButtonLabel: {
    fontSize: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
  },
  trendSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  trendMetric: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    marginHorizontal: 3,
  },
  trendMetricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  trendMetricLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 3,
  },
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    minHeight: 130,
    paddingTop: 8,
  },
  chartItem: {
    alignItems: 'center',
    flex: 1,
  },
  chartBar: {
    width: 20,
    borderRadius: 2,
    marginBottom: 8,
  },
  chartLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  chartValue: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  chartSubValue: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  chartPlanValue: {
    fontSize: 9,
    color: '#777',
    marginTop: 2,
  },
  trendHint: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
  recentWords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordChip: {
    marginBottom: 4,
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
});
