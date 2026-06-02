import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  FAB,
  Chip,
  Surface
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { Word } from '../types';

export default function HomeScreen() {
  const navigation = useNavigation();
  const [todayStats, setTodayStats] = useState({
    newWords: 0,
    reviewWords: 0,
    completedWords: 0,
    accuracy: 0
  });
  const [recentWords, setRecentWords] = useState<Word[]>([]);
  const [weeklyProgress, setWeeklyProgress] = useState<number[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      console.log('开始加载仪表板数据...');

      // 加载今日学习数据
      const today = new Date().toISOString().split('T')[0];
      console.log('今日日期:', today);

      const todayPlans = await StorageService.getTodayStudyPlan();
      console.log('今日计划:', todayPlans);

      const todayRecords = await StorageService.getStudyRecordsByDate(today);
      console.log('今日记录:', todayRecords);

      const newWords = todayPlans.filter(p => p.plan_type === 'new').length;
      const reviewWords = todayPlans.filter(p => p.plan_type === 'review').length;
      const completedWords = todayPlans.filter(p => p.completed).length;
      const accuracy = todayRecords.length > 0
        ? todayRecords.filter(r => r.result === 1).length / todayRecords.length
        : 0;

      setTodayStats({
        newWords,
        reviewWords,
        completedWords,
        accuracy
      });

      // 加载最近添加的单词
      const allWords = await StorageService.getWords();
      const words = allWords
        .sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 5);
      console.log('最近单词:', words);
      setRecentWords(words);

      // 加载一周进度
      const studyPlanService = new StudyPlanService();
      const stats = await studyPlanService.calculateStudyStats();
      console.log('学习统计:', stats);
      setWeeklyProgress(stats.weeklyProgress || []);

      console.log('仪表板数据加载完成');
    } catch (error) {
      console.error('加载仪表板数据失败:', error);
      // 设置默认值避免渲染错误
      setTodayStats({
        newWords: 0,
        reviewWords: 0,
        completedWords: 0,
        accuracy: 0
      });
      setRecentWords([]);
      setWeeklyProgress([]);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 0.8) return '#4CAF50';
    if (progress >= 0.6) return '#FF9800';
    return '#F44336';
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* 今日学习概览 */}
        <Card style={styles.card}>
          <Card.Title title="今日学习" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{todayStats.newWords}</Text>
                <Text style={styles.statLabel}>新词</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{todayStats.reviewWords}</Text>
                <Text style={styles.statLabel}>复习</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{todayStats.completedWords}</Text>
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
              <Text style={styles.progressLabel}>今日进度</Text>
              <ProgressBar
                progress={todayStats.completedWords / Math.max(todayStats.newWords + todayStats.reviewWords, 1)}
                color="#1976D2"
                style={styles.progressBar}
              />
            </View>
          </Card.Content>
        </Card>

        {/* 快速操作 */}
        <Card style={styles.card}>
          <Card.Title title="快速开始" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.quickActions}>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('AddWord' as never)}
                style={styles.actionButton}
                icon="plus"
              >
                添加单词
              </Button>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('学习' as never)}
                style={styles.actionButton}
                icon="book-open"
              >
                开始背诵
              </Button>
            </View>
            <View style={styles.quickActions}>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('ArticleList' as never)}
                style={styles.actionButton}
                icon="file-import"
              >
                趣味文章
              </Button>
              <Button
                mode="outlined"
                onPress={() => {/* 暂时禁用 */}}
                style={styles.actionButton}
                icon="pencil"
              >
                考题练习
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* 一周学习趋势 */}
        <Card style={styles.card}>
          <Card.Title title="一周学习趋势" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.weeklyChart}>
              {weeklyProgress.map((progress, index) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - index));
                const dayLabel = date.toLocaleDateString('zh-CN', { weekday: 'short' });

                return (
                  <View key={index} style={styles.chartItem}>
                    <Surface
                      style={[
                        styles.chartBar,
                        {
                          height: Math.max(progress * 60, 4),
                          backgroundColor: getProgressColor(progress)
                        }
                      ]}
                    />
                    <Text style={styles.chartLabel}>{dayLabel}</Text>
                    <Text style={styles.chartValue}>{Math.round(progress * 100)}%</Text>
                  </View>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        {/* 最近添加的单词 */}
        <Card style={styles.card}>
          <Card.Title
            title="最近添加"
            titleStyle={styles.cardTitle}
            right={() => (
              <Button onPress={() => navigation.navigate('WordList' as never)}>
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

        {/* 学习提醒 */}
        <Card style={[styles.card, styles.lastCard]}>
          <Card.Content>
            <Text style={styles.reminderTitle}>📚 学习提醒</Text>
            <Text style={styles.reminderText}>
              {todayStats.completedWords === 0
                ? "今天还没有开始学习，快来背几个单词吧！"
                : todayStats.accuracy < 0.6
                ? "今天的正确率偏低，建议多复习几遍"
                : "学习状态不错，继续保持！"}
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddWord' as never)}
      />
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
    marginBottom: 80, // 为FAB留出空间
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressSection: {
    marginTop: 8,
  },
  progressLabel: {
    fontSize: 14,
    marginBottom: 8,
    color: '#666',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 100,
    paddingTop: 20,
  },
  chartItem: {
    alignItems: 'center',
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
  reminderText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#1976D2',
  },
});