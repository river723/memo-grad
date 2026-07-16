import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import {
  Card,
  Text,
  Surface,
  Chip,
  Button,
  Divider,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { Word, StudyRecord, WeeklyStudyTrend } from '../types';
import { format } from 'date-fns';

/**
 * 学习统计详情页。
 * 从原 StatsScreen 的展开区拆出，展示今日概览、一周趋势、困难单词、里程碑。
 */
export default function StatsDetailScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();

  const [stats, setStats] = useState({
    totalWords: 0,
    todayStudyCount: 0,
    todayCorrectCount: 0,
    todayAccuracy: 0,
    weeklyTrend: [] as WeeklyStudyTrend[],
    difficultWords: [] as Word[],
    masteredWords: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const allWords = await StorageService.getWords();
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayRecords = await StorageService.getStudyRecordsByDate(today);
      const allRecords = await StorageService.getStudyRecords();

      const todayStudyCount = todayRecords.length;
      const todayCorrectCount = todayRecords.filter(r => r.result === 1).length;
      const todayAccuracy = todayStudyCount > 0 ? (todayCorrectCount / todayStudyCount) * 100 : 0;

      const studyPlanService = new StudyPlanService();
      const weeklyTrend = await studyPlanService.getWeeklyStudyTrend();

      const wordStats = calculateWordStats(allWords, allRecords);
      const difficultWords = wordStats
        .filter(ws => ws.correctRate < 0.5)
        .sort((a, b) => a.correctRate - b.correctRate)
        .map(ws => ws.word);

      const masteredWords = wordStats.filter(ws => ws.correctRate >= 0.8).length;

      setStats({
        totalWords: allWords.length,
        todayStudyCount,
        todayCorrectCount,
        todayAccuracy,
        weeklyTrend,
        difficultWords: difficultWords.slice(0, 5),
        masteredWords,
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
    if (value >= 80) return colors.success;
    if (value >= 60) return colors.warning;
    return colors.error;
  };

  const renderProgressBar = (value: number, color: string = colors.primary) => (
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
    </View>
  );

  const handleReinforceReview = () => {
    const wordIds = stats.difficultWords
      .map(word => word.id)
      .filter((id): id is number => typeof id === 'number');
    if (wordIds.length === 0) return;
    navigation.navigate('Main', { screen: 'Home' as any });
    setTimeout(() => {
      navigation.navigate('Home' as any, { screen: 'Study' as any });
    }, 100);
  };

  const maxStudyCount = Math.max(...stats.weeklyTrend.map(day => day.studyCount), 1);

  return (
    <ScrollView style={styles.container}>
      {/* 今日概览 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.detailHeader}>
            <MaterialIcons name="today" size={18} color={colors.primary} />
            <Text style={styles.detailSectionTitle}>今日概览</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.todayStudyCount}</Text>
              <Text style={styles.statLabel}>今日学习</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.success }]}>
                {stats.todayAccuracy.toFixed(0)}%
              </Text>
              <Text style={styles.statLabel}>今日正确率</Text>
            </View>
          </View>
          {renderProgressBar(stats.todayAccuracy, colors.success)}
        </Card.Content>
      </Card>

      {/* 一周趋势 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.detailHeader}>
            <MaterialIcons name="trending-up" size={18} color={colors.primary} />
            <Text style={styles.detailSectionTitle}>一周趋势</Text>
          </View>
          <View style={styles.weeklyChart}>
            {stats.weeklyTrend.map(day => {
              const ratio = maxStudyCount > 0 ? day.studyCount / maxStudyCount : 0;
              const dotColor = day.accuracy === null ? colors.outline : getProgressColor(day.accuracy * 100);
              return (
                <View key={day.date} style={styles.chartColumn}>
                  <View style={styles.chartDotWrapper}>
                    {day.studyCount > 0 && (
                      <View style={[styles.chartDot, { backgroundColor: dotColor }]} />
                    )}
                  </View>
                  <View style={styles.chartBarWrapper}>
                    <View style={[styles.chartBarSimple, { height: Math.max(ratio * 80, 2), backgroundColor: dotColor }]} />
                  </View>
                  <Text style={styles.chartDayLabel}>{day.dayLabel}</Text>
                  <Text style={styles.chartDayValue}>{day.studyCount > 0 ? day.studyCount : ''}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.tertiary }]} />
              <Text style={styles.legendText}>无学习</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>≥80%</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.warning }]} />
              <Text style={styles.legendText}>60-80%</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.error }]} />
              <Text style={styles.legendText}>&lt;60%</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* 困难单词 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.detailHeader}>
            <MaterialIcons name="error-outline" size={18} color={colors.warning} />
            <Text style={styles.detailSectionTitle}>困难单词</Text>
          </View>
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

      {/* 里程碑 */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.detailHeader}>
            <MaterialIcons name="emoji-events" size={18} color={colors.accent} />
            <Text style={styles.detailSectionTitle}>里程碑</Text>
          </View>
          <View style={styles.milestones}>
            {stats.totalWords >= 10 && (
              <View style={styles.milestoneItem}>
                <MaterialIcons name="star" size={18} color={colors.accent} />
                <Text style={styles.milestoneText}>已学习 {stats.totalWords} 个单词</Text>
              </View>
            )}
            {stats.masteredWords >= 5 && (
              <View style={styles.milestoneItem}>
                <MaterialIcons name="check-circle" size={18} color={colors.success} />
                <Text style={styles.milestoneText}>已掌握 {stats.masteredWords} 个单词</Text>
              </View>
            )}
            {stats.todayAccuracy >= 90 && (
              <View style={styles.milestoneItem}>
                <MaterialIcons name="local-fire-department" size={18} color={colors.error} />
                <Text style={styles.milestoneText}>今日正确率 {stats.todayAccuracy.toFixed(0)}%</Text>
              </View>
            )}
            {stats.totalWords < 10 && stats.masteredWords < 5 && stats.todayAccuracy < 90 && (
              <Text style={styles.noDataText}>坚持学习，解锁更多里程碑！</Text>
            )}
          </View>
        </Card.Content>
      </Card>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
    letterSpacing: 0.2,
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
    color: colors.primary,
  },
  statLabel: {
    fontSize: 14,
    color: colors.tertiary,
    marginTop: 4,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: colors.primaryContainer,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  chartColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  chartDotWrapper: {
    height: 10,
    alignItems: 'center',
  },
  chartDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartBarWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 84,
  },
  chartBarSimple: {
    width: 20,
    borderRadius: 4,
  },
  chartDayLabel: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 2,
  },
  chartDayValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurface,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  difficultWordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceVariant,
    elevation: 0,
  },
  difficultWordText: {
    fontSize: 15,
    color: colors.onSurface,
    fontWeight: '500',
  },
  difficultChip: {
    backgroundColor: colors.errorContainer,
    height: 24,
  },
  reinforceButton: {
    marginTop: 12,
    borderRadius: 10,
  },
  noDataText: {
    textAlign: 'center',
    color: colors.tertiary,
    padding: 16,
    fontSize: 14,
  },
  milestones: {
    gap: 4,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  milestoneText: {
    fontSize: 14,
    color: colors.onSurface,
  },
}));
