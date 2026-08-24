import React, { useState, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { ExamSession } from '../types';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import AppButton from '../components/ds/AppButton';
import EmptyState from '../components/ds/EmptyState';

export default function ExamHistoryScreen() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const navigation = useAppNavigation();
  const [sessions, setSessions] = useState<ExamSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [])
  );

  const loadSessions = async () => {
    const all = await StorageService.getExamSessions();
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setSessions(all);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('删除记录', '确定要删除这套考题吗？', {
      confirmText: '删除',
      cancelText: '取消',
    }).catch(() => false);
    if (!confirmed) return;
    await StorageService.deleteExamSession(id);
    loadSessions();
  };

  const handleRedo = (session: ExamSession) => {
    navigation.navigate('ExamAnswer', {
      questions: session.questions,
      questionType: session.question_type,
    });
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

  if (sessions.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="clipboard-text-history"
          title="暂无考题记录"
          description="完成 AI 出题练习后，可在此复习历史成绩与重做。"
          actionLabel="去做一组练习"
          onAction={() => navigation.navigate('ExamSetup')}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
      {sessions.map(session => {
        const total = session.questions.length;
        const correct = session.answers.filter(a => a.is_correct).length;
        return (
          <Pressable
            key={session.id}
            onPress={() => handleRedo(session)}
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
                  {formatDate(session.created_at)}
                </Text>
                <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant, marginTop: 2 }}>
                  {session.question_type === 'definition' ? '释义单选' : '完形选词'}
                  {' · '}{total} 题 · 上次答对 {correct} 题
                </Text>
              </View>
              <View style={styles.scoreCol}>
                <Text style={[styles.sessionScore, { color: getAccuracyColor(session.accuracy) }]}>
                  {Math.round(session.accuracy * 100)}%
                </Text>
                <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant, marginTop: 1 }}>
                  {correct}/{total}
                </Text>
              </View>
            </View>
            <View style={styles.sessionFooter}>
              <Pressable
                onPress={() => handleDelete(session.id)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { backgroundColor: pressed ? colors.errorContainer : 'transparent' },
                ]}
              >
                <MaterialCommunityIcons name="delete-outline" size={16} color={colors.tertiary} />
                <Text style={{ fontSize: typography.caption.size, color: colors.tertiary, marginLeft: 4 }}>删除</Text>
              </Pressable>
              <View style={styles.redoRow}>
                <Text style={{ fontSize: typography.caption.size, color: colors.primary, fontWeight: '600' }}>重做</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
              </View>
            </View>
          </Pressable>
        );
      })}

      <View style={{ marginTop: spacing.lg }}>
        <AppButton
          title="再做一组练习"
          onPress={() => navigation.navigate('ExamSetup')}
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<MaterialCommunityIcons name="plus" size={20} color={colors.primary} />}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
