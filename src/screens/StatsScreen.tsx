import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Surface,
  Chip,
  Button
} from 'react-native-paper';
import { useAppNavigation } from '../navigation/types';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { Word, StudyRecord, WeeklyStudyTrend } from '../types';
import { format } from 'date-fns';

export default function StatsScreen() {
  const navigation = useAppNavigation();
  const [stats, setStats] = useState({
    totalWords: 0,
    todayStudyCount: 0,
    todayCorrectCount: 0,
    todayAccuracy: 0,
    weeklyTrend: [] as WeeklyStudyTrend[],
    difficultWords: [] as Word[],
    masteredWords: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const handleReinforceReview = () => {
    const wordIds = stats.difficultWords
      .map(word => word.id)
      .filter((id): id is number => typeof id === 'number');

    if (wordIds.length === 0) return;

    navigation.navigate('Study', { wordIds });
  };

  const loadStats = async () => {
    try {
      const allWords = await StorageService.getWords();
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayRecords = await StorageService.getStudyRecordsByDate(today);
      const allRecords = await StorageService.getStudyRecords();

      // 今日统计
      const todayStudyCount = todayRecords.length;
      const todayCorrectCount = todayRecords.filter(r => r.result === 1).length;
      const todayAccuracy = todayStudyCount > 0 ? (todayCorrectCount / todayStudyCount) * 100 : 0;

      // 一周统计
      const studyPlanService = new StudyPlanService();
      const weeklyTrend = await studyPlanService.getWeeklyStudyTrend();

      // 困难单词（正确率低）
      const wordStats = calculateWordStats(allWords, allRecords);
      const difficultWords = wordStats
        .filter(ws => ws.correctRate < 0.5)
        .sort((a, b) => a.correctRate - b.correctRate)
        .map(ws => ws.word);

      // 已掌握单词（正确率 >= 80%）
      const masteredWords = wordStats.filter(ws => ws.correctRate >= 0.8).length;

      setStats({
        totalWords: allWords.length,
        todayStudyCount,
        todayCorrectCount,
        todayAccuracy,
        weeklyTrend,
        difficultWords: difficultWords.slice(0, 5),
        masteredWords
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const calculateWordStats = (words: Word[], records: StudyRecord[]) => {
    return words.map(word => {
      const wordRecords = records.filter(r => r.word_id === word.id);
      const correctCount = wordRecords.filter(r => r.result === 1).length;
      const totalCount = wordRecords.length;
      const correctRate = totalCount > 0 ? correctCount / totalCount : 0;

      return { word, correctRate, totalCount };
    });
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return '#4CAF50';
    if (value >= 60) return '#FF9800';
    return '#F44336';
  };

  const renderProgressBar = (value: number, color: string = '#1976D2') => (
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
    </View>
  );

  const weeklyStudyCount = stats.weeklyTrend.reduce((sum, day) => sum + day.studyCount, 0);
  const weeklyStudiedWordCount = stats.weeklyTrend.reduce((sum, day) => sum + day.studiedWordCount, 0);
  const weeklyCorrectCount = stats.weeklyTrend.reduce((sum, day) => sum + day.correctCount, 0);
  const weeklyPlannedCount = stats.weeklyTrend.reduce((sum, day) => sum + day.plannedCount, 0);
  const weeklyCompletedCount = stats.weeklyTrend.reduce((sum, day) => sum + day.completedCount, 0);
  const weeklyAccuracy = weeklyStudyCount > 0 ? (weeklyCorrectCount / weeklyStudyCount) * 100 : null;
  const weeklyCompletionRate = weeklyPlannedCount > 0 ? (weeklyCompletedCount / weeklyPlannedCount) * 100 : null;
  const maxStudyCount = Math.max(...stats.weeklyTrend.map(day => day.studyCount), 1);

  return (
    <ScrollView style={styles.container}>
      {/* 今日概览 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>📅 今日概览</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.todayStudyCount}</Text>
              <Text style={styles.statLabel}>今日学习</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
                {stats.todayAccuracy.toFixed(0)}%
              </Text>
              <Text style={styles.statLabel}>今日正确率</Text>
            </View>
          </View>
          {renderProgressBar(stats.todayAccuracy, '#4CAF50')}
        </Card.Content>
      </Card>

      {/* 词汇统计 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>📚 词汇统计</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: '#1976D2' }]}>{stats.totalWords}</Text>
              <Text style={styles.statLabel}>总单词数</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{stats.masteredWords}</Text>
              <Text style={styles.statLabel}>已掌握</Text>
            </View>
          </View>
          {stats.totalWords > 0 && renderProgressBar((stats.masteredWords / stats.totalWords) * 100)}
        </Card.Content>
      </Card>

      {/* 一周趋势 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>📈 一周学习趋势</Text>
          <View style={styles.trendSummary}>
            <View style={styles.trendMetric}>
              <Text style={styles.trendMetricValue}>{weeklyStudyCount}</Text>
              <Text style={styles.trendMetricLabel}>学习次数</Text>
            </View>
            <View style={styles.trendMetric}>
              <Text style={[styles.trendMetricValue, { color: weeklyAccuracy === null ? '#9E9E9E' : getProgressColor(weeklyAccuracy) }]}>
                {weeklyAccuracy === null ? '--' : `${weeklyAccuracy.toFixed(0)}%`}
              </Text>
              <Text style={styles.trendMetricLabel}>平均正确率</Text>
            </View>
            <View style={styles.trendMetric}>
              <Text style={[styles.trendMetricValue, { color: weeklyCompletionRate === null ? '#9E9E9E' : getProgressColor(weeklyCompletionRate) }]}>
                {weeklyCompletionRate === null ? '--' : `${weeklyCompletionRate.toFixed(0)}%`}
              </Text>
              <Text style={styles.trendMetricLabel}>计划完成</Text>
            </View>
          </View>

          <View style={styles.weeklyChart}>
            {stats.weeklyTrend.map(day => {
              const accuracy = day.accuracy === null ? null : day.accuracy * 100;
              const accuracyColor = accuracy === null ? '#BDBDBD' : getProgressColor(accuracy);
              const studyRatio = day.studyCount > 0 ? day.studyCount / maxStudyCount : 0;
              const completionText = day.completionRate === null
                ? '无计划'
                : `完${Math.round(day.completionRate * 100)}%`;

              return (
                <View key={day.date} style={styles.chartItem}>
                  <Surface style={[styles.chartBar, { height: Math.max(studyRatio * 70, 4), backgroundColor: accuracyColor }]}>
                    <View />
                  </Surface>
                  <Text style={styles.chartLabel}>{day.dayLabel}</Text>
                  <Text style={styles.chartValue}>{day.studyCount}次</Text>
                  <Text style={[styles.chartSubValue, { color: accuracyColor }]}>
                    {accuracy === null ? '--' : `${accuracy.toFixed(0)}%`}
                  </Text>
                  <Text style={styles.chartPlanValue}>{completionText}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.trendHint}>柱高代表学习量，颜色代表正确率，底部显示计划完成率。</Text>
        </Card.Content>
      </Card>

      {/* 困难单词 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>⚠️ 困难单词</Text>
          {stats.difficultWords.length > 0 ? (
            <>
              {stats.difficultWords.slice(0, 5).map((word, index) => (
                <Surface key={index} style={styles.difficultWordItem}>
                  <Text style={styles.difficultWordText}>{word.word}</Text>
                  <Chip mode="flat" compact style={styles.difficultChip}>
                    需加强
                  </Chip>
                </Surface>
              ))}
              <Button
                mode="contained"
                onPress={handleReinforceReview}
                style={styles.reinforceButton}
                icon="refresh"
              >
                强化复习
              </Button>
            </>
          ) : (
            <Text style={styles.noDataText}>暂无困难单词，继续加油！</Text>
          )}
        </Card.Content>
      </Card>

      {/* 学习里程碑 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>🏆 学习里程碑</Text>
          <View style={styles.milestones}>
            {stats.totalWords >= 10 && (
              <View style={styles.milestoneItem}>
                <Text style={styles.milestoneEmoji}>🌟</Text>
                <Text style={styles.milestoneText}>已学习 {stats.totalWords} 个单词</Text>
              </View>
            )}
            {stats.masteredWords >= 5 && (
              <View style={styles.milestoneItem}>
                <Text style={styles.milestoneEmoji}>🎯</Text>
                <Text style={styles.milestoneText}>已掌握 {stats.masteredWords} 个单词</Text>
              </View>
            )}
            {stats.todayAccuracy >= 90 && (
              <View style={styles.milestoneItem}>
                <Text style={styles.milestoneEmoji}>🔥</Text>
                <Text style={styles.milestoneText}>今日正确率 {stats.todayAccuracy.toFixed(0)}%</Text>
              </View>
            )}
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 16,
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
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
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
    minHeight: 145,
    paddingTop: 8,
  },
  chartItem: {
    alignItems: 'center',
    flex: 1,
  },
  chartBar: {
    width: 24,
    borderRadius: 4,
  },
  chartLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 8,
  },
  chartValue: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  chartSubValue: {
    fontSize: 11,
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
  difficultWordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#FFF8E1',
  },
  difficultWordText: {
    fontSize: 16,
    color: '#F57C00',
    fontWeight: '500',
  },
  difficultChip: {
    backgroundColor: '#FFE0B2',
  },
  reinforceButton: {
    marginTop: 8,
    borderRadius: 8,
  },
  noDataText: {
    textAlign: 'center',
    color: '#9E9E9E',
    padding: 16,
    fontSize: 14,
  },
  milestones: {
    gap: 12,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
  },
  milestoneEmoji: {
    fontSize: 20,
  },
  milestoneText: {
    fontSize: 14,
    color: '#333',
  },
});