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
import { ExamSession, WrongQuestion } from '../types';

export default function PracticeHubScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [sessions, wrongs] = await Promise.all([
        StorageService.getExamSessions(),
        StorageService.getWrongQuestions(),
      ]);
      setExamSessions(sessions);
      setWrongQuestions(wrongs);
    } catch (error) {
      console.error('加载练习数据失败:', error);
      setExamSessions([]);
      setWrongQuestions([]);
    }
  };

  const totalExams = examSessions.length;
  const avgAccuracy = totalExams > 0
    ? Math.round(examSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / totalExams * 100)
    : 0;
  const recentSessions = examSessions.slice(0, 5);

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
                  { color: wrongQuestions.length > 0 ? palette.danger : palette.success }
                ]}>
                  {wrongQuestions.length}
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
              开始练习
            </Button>
            <View style={styles.actionRow}>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('ArticleList')}
                style={styles.actionButton}
                icon="file-document"
              >
                趣味文章
              </Button>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('ExamHistory')}
                style={styles.actionButton}
                icon="history"
              >
                练习历史
              </Button>
            </View>
            <View style={styles.actionRow}>
              <Button
                mode="outlined"
                onPress={() => navigation.navigate('WrongQuestionReview')}
                style={styles.actionButton}
                icon="alert-circle"
              >
                错题本{wrongQuestions.length > 0 ? ` (${wrongQuestions.length})` : ''}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* 最近练习记录 */}
        {recentSessions.length > 0 && (
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
              {recentSessions.map((session, index) => (
                <Surface key={session.id || index} style={styles.sessionItem}>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionDate}>
                      {session.created_at
                        ? new Date(session.created_at).toLocaleDateString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '未知时间'}
                    </Text>
                    <Text style={styles.sessionType}>
                      {session.question_type === 'definition' ? '释义选择题' : '完形填空题'}
                      {' · '}
                      {session.questions?.length || 0} 题
                    </Text>
                  </View>
                  <Text style={[
                    styles.sessionAccuracy,
                    { color: (session.accuracy || 0) >= 0.7 ? palette.success : palette.danger }
                  ]}>
                    {Math.round((session.accuracy || 0) * 100)}%
                  </Text>
                </Surface>
              ))}
            </Card.Content>
          </Card>
        )}

        {examSessions.length === 0 && (
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
