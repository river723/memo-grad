import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { ExamSession } from '../types';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import AppButton from '../components/ds/AppButton';
import AppIcon from '../components/ds/AppIcon';
import EmptyState from '../components/ds/EmptyState';

/** 一套题 = 根记录（首次生成）+ 其全部重做行。 */
type ExamSet = {
  rootId: string;
  root: ExamSession;
  members: ExamSession[];   // 按作答时间倒序，members[0] 为最新一次
};

/** 从全部记录中提取题库视图：按 origin 分组，排除错题复习来源。 */
function buildExamSets(all: ExamSession[]): ExamSet[] {
  const groups = new Map<string, ExamSession[]>();
  for (const s of all) {
    const key = s.origin_id ?? s.id;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const sets: ExamSet[] = [];
  for (const [key, members] of groups) {
    const sorted = [...members].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    // 根成员必须是"出题"来源；错题复习行自成组且 source=wrong_review，在此被过滤
    if (sorted[0].source === 'wrong_review') continue;
    sets.push({ rootId: key, root: sorted[sorted.length - 1], members: sorted });
  }
  return sets.sort(
    (a, b) =>
      new Date(b.root.created_at).getTime() - new Date(a.root.created_at).getTime()
  );
}

export default function ExamSetBankScreen() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const navigation = useAppNavigation();
  const [sessions, setSessions] = useState<ExamSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setSessions(await StorageService.getExamSessions());
  };

  const sets = useMemo(() => buildExamSets(sessions), [sessions]);

  const handleDelete = async (set: ExamSet) => {
    const confirmed = await showConfirm(
      '删除套题',
      `确定要删除这套${set.root.question_type === 'definition' ? '释义单选' : '完形选词'}吗？\n该套题的 ${set.members.length} 次练习记录将一并移除。`,
      {
        confirmText: '删除',
        cancelText: '取消',
      }
    ).catch(() => false);
    if (!confirmed) return;
    await StorageService.deleteExamSet(set.rootId);
    load();
  };

  const getAccuracyColor = (rate: number) => {
    if (rate >= 0.8) return colors.success;
    if (rate >= 0.6) return colors.warning;
    return colors.danger;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  if (sets.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="library"
          title="AI 题库还是空的"
          description="用 AI 从你的生词生成练习题，每套题都会保存在这里，可随时重做。"
          actionLabel="去出一套题"
          onAction={() => navigation.navigate('ExamSetup')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        {sets.map(set => {
          const latest = set.members[0];
          const total = set.root.questions.length;
          const accuracy = latest.accuracy || 0;
          return (
            <Pressable
              key={set.rootId}
              onPress={() => navigation.navigate('ExamSetDetail', { rootId: set.rootId })}
              style={({ pressed }) => [
                styles.setCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.outline,
                  borderRadius: radius.lg,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.setMain}>
                <View style={styles.setTagRow}>
                  <Text
                    style={[
                      styles.setTypeTag,
                      {
                        color: colors.primary,
                        backgroundColor: colors.status.active.bg,
                      },
                    ]}
                  >
                    {set.root.question_type === 'definition' ? '释义单选' : '完形选词'}
                  </Text>
                  <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant }}>
                    {total} 题 · 出题 {formatDate(set.root.created_at)}
                  </Text>
                </View>
                <Text style={{ fontSize: typography.caption.size, color: colors.tertiary, marginTop: 4 }}>
                  上次练习 {formatDate(latest.created_at)} · 已练 {set.members.length} 次
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: '800',
                    letterSpacing: -0.5,
                    color: getAccuracyColor(accuracy),
                  }}
                >
                  {Math.round(accuracy * 100)}%
                </Text>
                <View style={styles.chevronRow}>
                  <Text style={{ fontSize: typography.caption.size, color: colors.primary, fontWeight: '600' }}>
                    查看题目
                  </Text>
                  <AppIcon name="chevron-right" size={16} color={colors.primary} />
                </View>
              </View>
              <Pressable
                onPress={() => handleDelete(set)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { backgroundColor: pressed ? colors.errorContainer : 'transparent' },
                ]}
              >
                <AppIcon name="delete-outline" size={18} color={colors.tertiary} />
              </Pressable>
            </Pressable>          );
        })}

        <View style={{ marginTop: spacing.lg }}>
          <AppButton
            title="再出一套题"
            onPress={() => navigation.navigate('ExamSetup')}
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={<AppIcon name="plus" size={20} color={colors.primary} />}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  setCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  setMain: {
    flex: 1,
    gap: 2,
  },
  setTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setTypeTag: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 999,
  },
}));
