/**
 * StatusChip —— 状态色卡。
 *
 * 6 状态 × 2 主题（light+dark）全部走 `colors.status` token。
 * 不再使用任何硬编码 hex，深色模式自动正确显示。
 *
 * 兼容历史 API：保留 active / paid / success / admin / user / expired / warning /
 * pending / refunded / failed / closed / banned 等 12 种 kind 名称，
 * 映射到 6 种状态色（active / pending / expired / refunded / closed / banned）。
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../../theme/theme';
import { radius, spacing } from '../../../theme/tokens';
import type { StatusKind } from '../../../theme/tokens';

export type { StatusKind } from '../../../theme/tokens';

// 兼容旧 kind 名称 → 6 状态 token 映射
const KIND_MAP: Record<LegacyStatusKind, StatusKind> = {
  active: 'active',
  paid: 'active',
  success: 'active',
  admin: 'active',
  user: 'closed',
  expired: 'expired',
  warning: 'pending',
  pending: 'pending',
  refunded: 'refunded',
  failed: 'refunded',
  closed: 'closed',
  banned: 'banned',
};

export type LegacyStatusKind =
  | 'active'
  | 'expired'
  | 'refunded'
  | 'pending'
  | 'paid'
  | 'closed'
  | 'banned'
  | 'admin'
  | 'user'
  | 'success'
  | 'failed'
  | 'warning';

const LABEL: Partial<Record<LegacyStatusKind, string>> = {
  active: '生效中',
  paid: '已支付',
  success: '成功',
  admin: '管理员',
  user: '用户',
  expired: '已过期',
  warning: '警告',
  pending: '待处理',
  refunded: '已退款',
  failed: '失败',
  closed: '已关闭',
  banned: '已封禁',
};

export interface StatusChipProps {
  kind: LegacyStatusKind;
  label?: string;
  size?: 'sm' | 'md';
}

export default function StatusChip({ kind, label, size = 'md' }: StatusChipProps) {
  const { colors } = useAppTheme();
  const statusKind = KIND_MAP[kind];
  const palette = colors.status[statusKind];

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          paddingHorizontal: size === 'sm' ? 8 : 10,
          paddingVertical: size === 'sm' ? 2 : 4,
          borderRadius: radius.pill,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: palette.fg,
            fontSize: size === 'sm' ? 11 : 12,
            fontWeight: '600',
          },
        ]}
        numberOfLines={1}
      >
        {label ?? LABEL[kind] ?? kind}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  text: { letterSpacing: 0.2 },
});
