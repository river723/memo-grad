import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Surface,
  Chip,
  Button
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { Word, StudyRecord } from '../types';
import { format } from 'date-fns';

export default function StatsScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState({
    totalWords: 0,
    todayStudyCount: 0,
    todayCorrectCount: 0,
    todayAccuracy: 0,
    weeklyAccuracy: [] as number[],
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
      const weeklyAccuracy = await getWeeklyAccuracy();

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
        weeklyAccuracy,
        difficultWords: difficultWords.slice(0, 5),
        masteredWords
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const getWeeklyAccuracy = async (): Promise<number[]> => {
    const result: number[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = format(new Date(today.getTime() - i * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
      const records = await StorageService.getStudyRecordsByDate(date);
      const correctCount = records.filter(r => r.result === 1).length;
      const accuracy = records.length > 0 ? (correctCount / records.length) * 100 : 0;
      result.push(accuracy);
    }

    return result;
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

  const getDifficultyColor = (level: number) => {
    const colors = ['#4CAF50', '#8BC34A', '#FF9800', '#FF5722', '#F44336'];
    return colors[level - 1] || '#9E9E9E';
  };

  const renderProgressBar = (value: number, color: string = '#1976D2') => (
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
    </View>
  );

  const daysOfWeek = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
          <Text style={styles.sectionTitle}>📈 一周正确率趋势</Text>
          <View style={styles.weeklyChart}>
            {stats.weeklyAccuracy.map((accuracy, index) => {
              const barHeight = Math.max(accuracy * 0.8, 4);
              const color = accuracy >= 80 ? '#4CAF50' : accuracy >= 60 ? '#FF9800' : '#F44336';

              return (
                <View key={index} style={styles.chartItem}>
                  <View style={[styles.chartBar, { height: barHeight, backgroundColor: color }]} />
                  <Text style={styles.chartLabel}>{daysOfWeek[index]}</Text>
                  <Text style={[styles.chartValue, { color }]}>
                    {accuracy.toFixed(0)}%
                  </Text>
                </View>
              );
            })}
          </View>
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
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 20,
  },
  chartItem: {
    alignItems: 'center',
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