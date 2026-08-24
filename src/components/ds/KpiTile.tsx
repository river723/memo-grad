/**
 * KpiTile —— Admin 后台 KPI 卡片。
 *
 * 替代原 AdminKpiCard（无 sparkline / 无对比基线 / 10 个 hex 硬编码）。
 *
 *   <KpiTile
 *     label="今日新增用户"
 *     value="48"
 *     icon="account-plus"
 *     trend="up"
 *     trendValue="+12%"
 *     sparkline={[12, 18, 9, 24, 31, 22, 48]}
 *     tone="primary"
 *   />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppIcon, { type IconName } from './AppIcon';
import { useAppTheme } from '../../theme/theme';
import { radius, spacing } from '../../theme/tokens';
import type { TrendDirection } from './StatStrip';

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface KpiTileProps {
  label: string;
  value: string | number;
  icon?: IconName;
  hint?: string;
  trend?: TrendDirection;
  trendValue?: string;
  sparkline?: number[]; // 0-100 归一化数据
  tone?: KpiTone;
}

export default function KpiTile({
  label,
  value,
  icon,
  hint,
  trend,
  trendValue,
  sparkline,
  tone = 'primary',
}: KpiTileProps) {
  const { colors } = useAppTheme();

  const accent =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
      ? colors.warning
      : tone === 'danger'
      ? colors.danger
      : tone === 'neutral'
      ? colors.onSurfaceVariant
      : colors.primary;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.outline,
          borderRadius: radius.lg,
        },
        colors.shadow.hairline,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '20' }]}>
          {icon ? (
            <AppIcon name={icon} size={16} color={accent} />
          ) : null}
        </View>
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
          {label}
        </Text>
      </View>

      <View style={styles.bodyRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.value,
              {
                color: colors.onSurface,
                fontSize: colors.typography.headline.size,
                lineHeight: colors.typography.headline.lineHeight,
              },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
          {(trend || hint) && (
            <View style={styles.metaRow}>
              {trend && trend !== 'flat' ? (
                <MaterialCommunityIcons
                  name={trend === 'up' ? 'arrow-up-thin' : 'arrow-down-thin'}
                  size={12}
                  color={trend === 'up' ? colors.success : colors.danger}
                />
              ) : null}
              {trendValue ? (
                <Text
                  style={[
                    styles.meta,
                    {
                      color: trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.tertiary,
                      fontSize: colors.typography.caption.size,
                    },
                  ]}
                >
                  {trendValue}
                </Text>
              ) : null}
              {hint ? (
                <Text
                  style={[
                    styles.meta,
                    {
                      color: colors.tertiary,
                      fontSize: colors.typography.caption.size,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {hint}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline data={sparkline} color={accent} />
        ) : null}
      </View>
    </View>
  );
}

// === Sparkline 内嵌：纯 View 拼 8 段折线，不依赖 SVG ===
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 64;
  const h = 28;
  const stepX = w / (data.length - 1);

  return (
    <View style={{ width: w, height: h }}>
      {data.map((v, i) => {
        const x = i * stepX;
        const y = h - ((v - min) / range) * h;
        if (i === data.length - 1) {
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x - 2,
                top: y - 2,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          );
        }
        return null;
      })}
      {/* 折线：每对相邻点画一段细线（用 transform 旋转的细长 View） */}
      {data.slice(0, -1).map((v, i) => {
        const x1 = i * stepX;
        const y1 = h - ((v - min) / range) * h;
        const x2 = (i + 1) * stepX;
        const y2 = h - ((data[i + 1] - min) / range) * h;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={`seg-${i}`}
            style={{
              position: 'absolute',
              left: x1,
              top: y1 - 0.5,
              width: length,
              height: 1.5,
              backgroundColor: color,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0% 50%',
            }}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    padding: spacing.md,
    borderWidth: 1,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '500', flex: 1 },
  bodyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  value: { fontWeight: '700', letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  meta: { fontWeight: '500' },
});
