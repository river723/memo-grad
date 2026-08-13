/**
 * StatsDetailScreen —— 叙事式学习统计详情。
 *
 * 三段：
 *   1. 过去 7 天 折线图（studyCount 主线 + 平均值虚线）+ 当日 3 个 metric
 *   2. 困难词 Top 5（带最近 7 次作答 sparkline）
 *   3. 里程碑 / 已掌握
 *
 * 视觉锚点：墨绿主线 / 赭石辅助 / 衬线大数字 / 1px 描边 / sparkline。
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { Word, StudyRecord, WeeklyStudyTrend } from '../types';
import { format } from 'date-fns';
import StatStrip from '../components/ds/StatStrip';
import SectionHeader from '../components/ds/SectionHeader';
import EmptyState from '../components/ds/EmptyState';
import AppButton from '../components/ds/AppButton';

interface WordStat {
  word: Word;
  correctRate: number;
  totalCount: number;
  recentResults: number[]; // 最近 7 次 0/1
}

export default function StatsDetailScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const typography = colors.typography;

  const [stats, setStats] = useState({
    totalWords: 0,
    todayStudyCount: 0,
    todayCorrectCount: 0,
    todayAccuracy: 0,
    weeklyTrend: [] as WeeklyStudyTrend[],
    difficultWords: [] as WordStat[],
    masteredWords: 0,
  });
  const [loaded, setLoaded] = useState(false);

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
      const todayCorrectCount = todayRecords.filter((r) => r.result === 1).length;
      const todayAccuracy = todayStudyCount > 0 ? (todayCorrectCount / todayStudyCount) * 100 : 0;
      const studyPlanService = new StudyPlanService();
      const weeklyTrend = await studyPlanService.getWeeklyStudyTrend();

      const wordStats: WordStat[] = allWords.map((w) => {
        const wordRecords = allRecords.filter((r) => r.word_id === w.id);
        const correct = wordRecords.filter((r) => r.result === 1).length;
        const total = wordRecords.length;
        const rate = total > 0 ? correct / total : 0;
        const recent = wordRecords
          .sort((a, b) => new Date(b.study_date || 0).getTime() - new Date(a.study_date || 0).getTime())
          .slice(0, 7)
          .reverse()
          .map((r) => (r.result === 1 ? 1 : 0));
        return { word: w, correctRate: rate, totalCount: total, recentResults: recent };
      });
      const difficult = wordStats
        .filter((ws) => ws.totalCount > 0 && ws.correctRate < 0.5)
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 5);
      const mastered = wordStats.filter((ws) => ws.correctRate >= 0.8).length;

      setStats({
        totalWords: allWords.length,
        todayStudyCount,
        todayCorrectCount,
        todayAccuracy,
        weeklyTrend,
        difficultWords: difficult,
        masteredWords: mastered,
      });
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setLoaded(true);
    }
  };

  const handleReinforce = () => {
    const ids = stats.difficultWords
      .map((ws) => ws.word.id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return;
    navigation.navigate('Main' as any, {
      screen: 'Home' as any,
      params: { screen: 'Study' as any, params: { wordIds: ids } },
    });
  };

  // === 7-day 平均值 ===
  const avgStudy =
    stats.weeklyTrend.length > 0
      ? stats.weeklyTrend.reduce((s, d) => s + d.studyCount, 0) / stats.weeklyTrend.length
      : 0;

  if (loaded && stats.totalWords === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          icon="chart-line-variant"
          title="还没有学习数据"
          description="开始背单词后，这里会展示你的学习趋势和进步轨迹。"
          actionLabel="开始学习"
          onAction={() => navigation.navigate('Main' as any, { screen: 'Home' as any })}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
    >
      {/* === 第一段：过去 7 天 === */}
      <SectionHeader title="过去 7 天" subtitle="每日学习次数" icon="chart-line-variant" />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outline,
            borderRadius: radius.lg,
          },
          colors.shadow.card,
        ]}
      >
        <TrendLineChart trend={stats.weeklyTrend} average={avgStudy} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
            <Text style={[styles.legendText, { color: colors.onSurfaceVariant, fontSize: typography.caption.size }]}>
              每日次数
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.tertiary, opacity: 0.5 }]} />
            <Text style={[styles.legendText, { color: colors.onSurfaceVariant, fontSize: typography.caption.size }]}>
              7 天均值 {avgStudy.toFixed(1)}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <StatStrip
          metrics={[
            { value: stats.todayStudyCount, label: '今日学习' },
            {
              value: `${Math.round(stats.todayAccuracy)}%`,
              label: '今日正确率',
              trend: stats.todayAccuracy >= 70 ? 'up' : stats.todayAccuracy >= 50 ? 'flat' : 'down',
            },
            { value: stats.totalWords, label: '词库总量' },
          ]}
        />
      </View>

      {/* === 第二段：困难词 Top 5（带 7 次 sparkline） === */}
      <SectionHeader
        title="困难词"
        subtitle="历史正确率低于 50%"
        icon="alert-circle-outline"
      />
      {stats.difficultWords.length > 0 ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radius.lg,
              overflow: 'hidden',
            },
            colors.shadow.hairline,
          ]}
        >
          {stats.difficultWords.map((ws, idx) => (
            <Pressable
              key={ws.word.id ?? idx}
              onPress={() => ws.word.id && navigation.navigate('WordDetail' as any, { wordId: ws.word.id })}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomColor: colors.outline,
                  borderBottomWidth: idx < stats.difficultWords.length - 1 ? 1 : 0,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.onSurface,
                    fontSize: typography.bodyLg.size,
                    fontWeight: '600',
                    fontFamily: 'SourceSerif4, Georgia, serif',
                  }}
                >
                  {ws.word.word}
                </Text>
                <Text
                  style={{
                    color: colors.tertiary,
                    fontSize: typography.caption.size,
                    marginTop: 2,
                  }}
                >
                  {Math.round(ws.correctRate * 100)}% · {ws.totalCount} 次
                </Text>
              </View>
              <Sparkline data={ws.recentResults} color={colors.danger} width={56} height={20} />
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.tertiary} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radius.lg,
            },
          ]}
        >
          <Text
            style={{
              color: colors.tertiary,
              fontSize: typography.body.size,
              textAlign: 'center',
              paddingVertical: spacing.lg,
            }}
          >
            目前没有困难词，继续保持！
          </Text>
        </View>
      )}

      {stats.difficultWords.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <AppButton
            title="强化复习困难词"
            onPress={handleReinforce}
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={<MaterialCommunityIcons name="refresh" size={20} color={colors.onPrimary} />}
          />
        </View>
      )}

      {/* === 第三段：里程碑 === */}
      <SectionHeader title="里程碑" icon="trophy-outline" />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outline,
            borderRadius: radius.lg,
            padding: spacing.md,
          },
        ]}
      >
        <Milestone
          achieved={stats.totalWords >= 10}
          icon="book-check-outline"
          label={`已学习 ${stats.totalWords} 个单词`}
          hint="累计收录的生词量"
        />
        <Milestone
          achieved={stats.masteredWords >= 5}
          icon="check-decagram-outline"
          label={`已掌握 ${stats.masteredWords} 个单词`}
          hint="历史正确率 ≥ 80%"
        />
        <Milestone
          achieved={stats.todayAccuracy >= 90}
          icon="fire"
          label={`今日正确率 ${Math.round(stats.todayAccuracy)}%`}
          hint="目标 ≥ 90%"
        />
      </View>
    </ScrollView>
  );
}

// === 折线图：纯 View 拼成 ===
const TrendLineChart: React.FC<{ trend: WeeklyStudyTrend[]; average: number }> = ({ trend, average }) => {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const width = 320;
  const height = 120;
  const padding = { top: 12, right: 8, bottom: 24, left: 28 };
  const max = Math.max(...trend.map((d) => d.studyCount), average, 1);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : 0;

  const toPoint = (i: number, v: number) => ({
    x: padding.left + i * stepX,
    y: padding.top + innerH - (v / max) * innerH,
  });

  // Y 轴 ticks
  const yTicks = [0, Math.ceil(max / 2), Math.ceil(max)];

  return (
    <View style={{ width, height, alignSelf: 'center' }}>
      {/* Y 轴刻度线 */}
      {yTicks.map((t, i) => {
        const y = padding.top + innerH - (t / max) * innerH;
        return (
          <View
            key={`y-${i}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: y,
              height: 1,
              backgroundColor: colors.outline,
              opacity: 0.4,
            }}
          />
        );
      })}
      {/* 平均值虚线 */}
      {average > 0 && (
        <View
          style={{
            position: 'absolute',
            left: padding.left,
            right: padding.right,
            top: padding.top + innerH - (average / max) * innerH,
            height: 1,
            borderTopWidth: 1,
            borderColor: colors.tertiary,
            borderStyle: 'dashed',
            opacity: 0.6,
          }}
        />
      )}
      {/* 数据点 + 折线段 */}
      {trend.map((d, i) => {
        if (i === trend.length - 1) return null;
        const p1 = toPoint(i, d.studyCount);
        const p2 = toPoint(i + 1, trend[i + 1].studyCount);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={`seg-${i}`}
            style={{
              position: 'absolute',
              left: p1.x,
              top: p1.y - 1,
              width: length,
              height: 2,
              backgroundColor: colors.primary,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0% 50%',
              borderRadius: 1,
            }}
          />
        );
      })}
      {/* 数据点圆 */}
      {trend.map((d, i) => {
        const p = toPoint(i, d.studyCount);
        return (
          <View
            key={`pt-${i}`}
            style={{
              position: 'absolute',
              left: p.x - 4,
              top: p.y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: d.studyCount > 0 ? colors.primary : colors.outline,
              borderWidth: 1.5,
              borderColor: colors.surface,
            }}
          />
        );
      })}
      {/* X 轴标签 */}
      {trend.map((d, i) => {
        const p = toPoint(i, 0);
        return (
          <Text
            key={`xl-${i}`}
            style={{
              position: 'absolute',
              left: p.x - 12,
              top: padding.top + innerH + 4,
              width: 24,
              textAlign: 'center',
              color: colors.tertiary,
              fontSize: typography.caption.size,
              fontWeight: '500',
            }}
          >
            {d.dayLabel}
          </Text>
        );
      })}
    </View>
  );
};

// === Sparkline：0/1 序列 → 折线 ===
const Sparkline: React.FC<{ data: number[]; color: string; width: number; height: number }> = ({
  data,
  color,
  width,
  height,
}) => {
  const { colors: c } = useAppTheme();
  if (data.length === 0) {
    return <View style={{ width, height }} />;
  }
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const toPoint = (i: number, v: number) => ({
    x: i * stepX,
    y: height - v * (height - 4) - 2,
  });
  return (
    <View style={{ width, height, marginRight: spacing.sm }}>
      {data.slice(0, -1).map((v, i) => {
        const p1 = toPoint(i, v);
        const p2 = toPoint(i + 1, data[i + 1]);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={`s-${i}`}
            style={{
              position: 'absolute',
              left: p1.x,
              top: p1.y - 0.5,
              width: length,
              height: 1.5,
              backgroundColor: color,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0% 50%',
              borderRadius: 1,
            }}
          />
        );
      })}
      {data.map((v, i) => {
        const p = toPoint(i, v);
        return (
          <View
            key={`sp-${i}`}
            style={{
              position: 'absolute',
              left: p.x - 2,
              top: p.y - 2,
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: v === 1 ? color : c.outline,
            }}
          />
        );
      })}
    </View>
  );
};

const Milestone: React.FC<{ achieved: boolean; icon: any; label: string; hint: string }> = ({
  achieved,
  icon,
  label,
  hint,
}) => {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.sm,
        gap: 12,
        opacity: achieved ? 1 : 0.4,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: achieved ? colors.status.active.bg : colors.outline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={achieved ? colors.success : colors.tertiary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.onSurface,
            fontSize: typography.bodyLg.size,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: colors.tertiary,
            fontSize: typography.caption.size,
            marginTop: 2,
          }}
        >
          {hint}
        </Text>
      </View>
      {achieved && <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 12,
    height: 3,
    borderRadius: 1.5,
  },
  legendText: {},
});
