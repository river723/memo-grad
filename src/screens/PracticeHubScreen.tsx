import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  Button,
  Surface,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { ExamSession, WrongQuestion, RealExamSession, RealExamWrongQuestion } from '../types';

/** 统一的"最近练习"视图模型，合并考题与真题两套 session。 */
type RecentItem = {
  key: string;
  createdAt: string;
  label: string;
  count: number;
  accuracy: number; // 0-1
};

export default function PracticeHubScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [realExamSessions, setRealExamSessions] = useState<RealExamSession[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [realExamWrong, setRealExamWrong] = useState<RealExamWrongQuestion[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [sessions, realSessions, wrongs, realWrongs] = await Promise.all([
        StorageService.getExamSessions(),
        StorageService.getRealExamSessions(),
        StorageService.getWrongQuestions(),
        StorageService.getRealExamWrongQuestions(),
      ]);
      setExamSessions(sessions);
      setRealExamSessions(realSessions);
      setWrongQuestions(wrongs);
      setRealExamWrong(realWrongs);
    } catch (error) {
      console.error('加载练习数据失败:', error);
      setExamSessions([]);
      setRealExamSessions([]);
      setWrongQuestions([]);
      setRealExamWrong([]);
    }
  };

  // 概览聚合考题 + 真题两套 session
  const totalExams = examSessions.length + realExamSessions.length;
  const allAccuracies = [
    ...examSessions.map(s => s.accuracy || 0),
    ...realExamSessions.map(s => (s.total > 0 ? s.score / s.total : 0)),
  ];
  const avgAccuracy = allAccuracies.length > 0
    ? Math.round(allAccuracies.reduce((sum, a) => sum + a, 0) / allAccuracies.length * 100)
    : 0;
  // 待复习错题聚合单词错题本 + 真题错题本
  const totalWrong = wrongQuestions.length + realExamWrong.length;

  // 最近练习：合并两套 session，按时间倒序取前 5
  const recentItems: RecentItem[] = [
    ...examSessions.map(s => ({
      key: `exam-${s.id}`,
      createdAt: s.created_at,
      label: s.question_type === 'definition' ? '释义选择题' : '完形填空题',
      count: s.questions?.length || 0,
      accuracy: s.accuracy || 0,
    })),
    ...realExamSessions.map(s => ({
      key: `real-${s.id}`,
      createdAt: s.createdAt,
      label: `真题·${s.mode === 'reading' ? '阅读' : '完形'} ${s.year}`,
      count: s.total,
      accuracy: s.total > 0 ? s.score / s.total : 0,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* 练习概览 */}
        <Card style={styles.card}>
          <Card.Title title="练习概览" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{totalExams}</Text>
                <Text style={styles.statLabel}>练习次数</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[
                  styles.statNumber,
                  { color: avgAccuracy >= 70 ? palette.success : totalExams === 0 ? colors.tertiary : palette.accent }
                ]}>
                  {totalExams > 0 ? `${avgAccuracy}%` : '-'}
                </Text>
                <Text style={styles.statLabel}>平均正确率</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[
                  styles.statNumber,
                  { color: totalWrong > 0 ? palette.danger : palette.success }
                ]}>
                  {totalWrong}
                </Text>
                <Text style={styles.statLabel}>待复习错题</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* 快捷操作 */}
        <Card style={styles.card}>
          <Card.Title title="练习模式" titleStyle={styles.cardTitle} />
          <Card.Content>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('ExamSetup')}
              style={styles.primaryButton}
              icon="play-circle"
              labelStyle={styles.primaryButtonLabel}
            >
              AI出题练习
            </Button>
            <Button
              mode="contained-tonal"
              onPress={() => navigation.navigate('RealExamList')}
              style={styles.primaryButton}
              icon="book-open-page-variant"
              labelStyle={styles.primaryButtonLabel}
            >
              真题练习
            </Button>
            <View style={styles.actionRow}>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('ExamHistory')}
                style={styles.actionButton}
                icon="history"
              >
                AI题库
              </Button>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('WrongQuestionReview')}
                style={styles.actionButton}
                icon="alert-circle"
              >
                错题本{totalWrong > 0 ? ` (${totalWrong})` : ''}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* 最近练习记录 */}
        {recentItems.length > 0 && (
          <Card style={styles.card}>
            <Card.Title
              title="最近练习"
              titleStyle={styles.cardTitle}
              right={() => (
                <Button onPress={() => navigation.navigate('ExamHistory')}>
                  查看全部
                </Button>
              )}
            />
            <Card.Content>
              {recentItems.map((item) => (
                <Surface key={item.key} style={styles.sessionItem}>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionDate}>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '未知时间'}
                    </Text>
                    <Text style={styles.sessionType}>
                      {item.label}
                      {' · '}
                      {item.count} 题
                    </Text>
                  </View>
                  <Text style={[
                    styles.sessionAccuracy,
                    { color: item.accuracy >= 0.7 ? palette.success : palette.danger }
                  ]}>
                    {Math.round(item.accuracy * 100)}%
                  </Text>
                </Surface>
              ))}
            </Card.Content>
          </Card>
        )}

        {totalExams === 0 && (
          <Card style={[styles.card, styles.lastCard]}>
            <Card.Content>
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📝</Text>
                <Text style={styles.emptyText}>
                  还没有练习记录
                </Text>
                <Text style={styles.emptyHint}>
                  点击上方「开始练习」，AI 将根据你的单词库生成专属考题
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    marginBottom: 8,
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
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
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
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDate: {
    fontSize: 14,
    fontWeight: '500',
  },
  sessionType: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  sessionAccuracy: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
}));
