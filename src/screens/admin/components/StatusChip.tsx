/**
 * 状态色卡：统一订阅状态、订单状态、封禁状态、用户角色的色卡显示。
 */
import React from 'react';
import { Chip } from 'react-native-paper';
import { useAppTheme } from '../../../theme/theme';

export type StatusKind = 'active' | 'expired' | 'refunded' | 'pending' | 'paid' | 'closed' | 'banned' | 'admin' | 'user' | 'success' | 'failed' | 'warning';

const LABEL: Partial<Record<StatusKind, string>> = {
  active: '生效中',
  expired: '已过期',
  refunded: '已退款',
  pending: '待支付',
  paid: '已支付',
  closed: '已关闭',
  banned: '已封禁',
  admin: '管理员',
  user: '用户',
  success: '成功',
  failed: '失败',
  warning: '警告',
};

export default function StatusChip({ kind, label }: { kind: StatusKind; label?: string }) {
  const { colors } = useAppTheme();
  const bgMap: Record<StatusKind, string> = {
    active: '#d4edda',
    paid: '#d4edda',
    success: '#d4edda',
    admin: '#cce5ff',
    user: '#e2e3e5',
    expired: '#fff3cd',
    warning: '#fff3cd',
    pending: '#fff3cd',
    refunded: '#f8d7da',
    failed: '#f8d7da',
    closed: '#e2e3e5',
    banned: '#f8d7da',
  };
  const fgMap: Record<StatusKind, string> = {
    active: '#155724',
    paid: '#155724',
    success: '#155724',
    admin: '#004085',
    user: '#383d41',
    expired: '#856404',
    warning: '#856404',
    pending: '#856404',
    refunded: '#721c24',
    failed: '#721c24',
    closed: '#383d41',
    banned: '#721c24',
  };
  return (
    <Chip
      compact
      style={{ backgroundColor: bgMap[kind], marginRight: 4 }}
      textStyle={{ color: fgMap[kind], fontSize: 11 }}
    >
      {label ?? LABEL[kind] ?? kind}
    </Chip>
  );
}
