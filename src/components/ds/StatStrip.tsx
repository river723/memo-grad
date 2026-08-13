/**
 * StatStrip —— 横向 metric 行。
 *
 * 用于 HomeScreen 顶部 / StatsScreen 概览等场景，替代"文字+数字双显"的硬排版。
 *
 *   <StatStrip
 *     metrics={[
 *       { value: 28, label: '今日已学', trend: 'up' },
 *       { value: '78%', label: '正确率', trend: 'down' },
 *       { value: 12, label: '连续天数', trend: 'flat' },
 *     ]}
 *   />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { spacing, radius } from '../../theme/tokens';

export type TrendDirection = 'up' | 'down' | 'flat';

export interface StatMetric {
  value: string | number;
  label: string;
  trend?: TrendDirection;
  trendValue?: string;
  tint?: string;
}

export interface StatStripProps {
  metrics: StatMetric[];
  dividerColor?: string;
  compact?: boolean;
}

export default function StatStrip({ metrics, compact = false }: StatStripProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: colors.outline,
          borderWidth: 1,
          paddingVertical: compact ? spacing.md : spacing.lg,
        },
        colors.shadow.hairline,
      ]}
    >
      {metrics.map((m, idx) => (
        <View key={idx} style={styles.cell}>
          <View style={styles.valueRow}>
            <Text
              style={[
                styles.value,
                {
                  color: m.tint ?? colors.onSurface,
                  fontSize: compact
                    ? colors.typography.title.size
                    : colors.typography.headline.size,
                  lineHeight: compact
                    ? colors.typography.title.lineHeight
                    : colors.typography.headline.lineHeight,
                },
              ]}
              numberOfLines={1}
            >
              {m.value}
            </Text>
            {m.trend && m.trend !== 'flat' ? (
              <MaterialCommunityIcons
                name={m.trend === 'up' ? 'arrow-up-thin' : 'arrow-down-thin'}
                size={14}
                color={m.trend === 'up' ? colors.success : colors.danger}
                style={{ marginLeft: 4 }}
              />
            ) : null}
          </View>
          {m.trendValue ? (
            <Text
              style={[
                styles.trend,
                {
                  color: m.trend === 'up' ? colors.success : m.trend === 'down' ? colors.danger : colors.tertiary,
                },
              ]}
            >
              {m.trendValue}
            </Text>
          ) : null}
          <Text
            style={[
              styles.label,
              {
                color: colors.onSurfaceVariant,
                fontSize: colors.typography.caption.size,
              },
            ]}
            numberOfLines={1}
          >
            {m.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  value: { fontWeight: '700', letterSpacing: -0.3 },
  trend: { fontSize: 11, fontWeight: '500' },
  label: { fontWeight: '500' },
});
