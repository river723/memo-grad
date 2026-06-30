import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { Word, StudyRecord } from '../types';

const APP_VERSION = '1.0.0';

type Summary = {
  totalWords: number;
  mastered: number;
  examCount: number;
};

const DEFAULT_SUMMARY: Summary = { totalWords: 0, mastered: 0, examCount: 0 };

/** 已掌握：该词历史正确率 ≥ 0.8 */
const countMastered = (words: Word[], records: StudyRecord[]) => {
  const byWord = new Map<number, { total: number; correct: number }>();
  for (const r of records) {
    const e = byWord.get(r.word_id) || { total: 0, correct: 0 };
    e.total += 1;
    if (r.result === 1) e.correct += 1;
    byWord.set(r.word_id, e);
  }
  let mastered = 0;
  for (const w of words) {
    if (typeof w.id !== 'number') continue;
    const e = byWord.get(w.id);
    if (e && e.total > 0 && e.correct / e.total >= 0.8) mastered += 1;
  }
  return mastered;
};

function StatMetric({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statNumber, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [summary, setSummary] = useState<Summary>(DEFAULT_SUMMARY);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          const [words, records, sessions] = await Promise.all([
            StorageService.getWords(),
            StorageService.getStudyRecords(),
            StorageService.getExamSessions(),
          ]);
          setSummary({
            totalWords: words.length,
            mastered: countMastered(words, records),
            examCount: sessions.length,
          });
        } catch (error) {
          console.error('加载个人数据失败:', error);
          setSummary(DEFAULT_SUMMARY);
        }
      };
      load();
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 学习统计概览 */}
        <Card style={styles.card}>
          <Card.Title title="学习统计" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.statsRow}>
              <StatMetric value={summary.totalWords} label="总词数" color={colors.primary} />
              <StatMetric value={summary.mastered} label="已掌握" color={palette.success} />
              <StatMetric value={summary.examCount} label="练习次数" color={colors.primary} />
            </View>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('Stats')}
              icon="chart-bar"
              style={styles.entryButton}
            >
              查看完整统计
            </Button>
          </Card.Content>
        </Card>

        {/* 应用入口 */}
        <Card style={styles.card}>
          <Card.Title title="应用" titleStyle={styles.cardTitle} />
          <Card.Content>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('Settings')}
              icon="cog"
              style={styles.entryButton}
            >
              设置
            </Button>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>版本</Text>
              <Text style={styles.aboutValue}>{APP_VERSION}</Text>
            </View>
          </Card.Content>
        </Card>
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
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
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
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  entryButton: {
    marginTop: 4,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outline,
  },
  aboutLabel: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
}));
