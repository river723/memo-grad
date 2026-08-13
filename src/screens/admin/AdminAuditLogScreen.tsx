/**
 * 后台审计日志 Tab：所有 admin 写操作记录。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Text, Button, Chip, IconButton } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { makeStyles } from '../../utils/useStyles';
import { AdminApi } from '../../services/AdminApi';
import type { AdminActionLog } from './types';

const ACTION_LABELS: Record<string, string> = {
  'user.ban': '封禁',
  'user.unban': '解封',
  'user.set_role': '改角色',
  'user.reset_password': '重置密码',
  'user.force_logout': '强制下线',
  'user.reset_ai_quota': '重置 AI 配额',
  'sub.grant': '授权订阅',
  'sub.revoke': '撤销订阅',
  'sub.refund': '退款',
  'announcement.create': '创建公告',
  'announcement.delete': '删除公告',
};

const ACTION_COLORS: Record<string, string> = {
  'user.ban': '#c62828',
  'user.unban': '#2e7d32',
  'user.set_role': '#1565c0',
  'user.reset_password': '#e65100',
  'user.force_logout': '#546e7a',
  'user.reset_ai_quota': '#00838f',
  'sub.grant': '#2e7d32',
  'sub.revoke': '#c62828',
  'sub.refund': '#c62828',
  'announcement.create': '#6a1b9a',
  'announcement.delete': '#546e7a',
};

const ACTION_ICONS: Record<string, string> = {
  'user.ban': 'block',
  'user.unban': 'check-circle',
  'user.set_role': 'admin-panel-settings',
  'user.reset_password': 'lock-reset',
  'user.force_logout': 'logout',
  'user.reset_ai_quota': 'memory',
  'sub.grant': 'thumb-up',
  'sub.revoke': 'thumb-down',
  'sub.refund': 'money-off',
  'announcement.create': 'campaign',
  'announcement.delete': 'delete-forever',
};

export default function AdminAuditLogScreen() {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    // 筛选条
    filterRow: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: 10, paddingVertical: 8,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline,
      gap: 4,
    },
    // 统计行
    statsRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 6,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline, gap: 6,
    },
    statsText: { fontSize: 11, color: c.onSurfaceVariant },
    // 日志列表
    list: { paddingBottom: 20 },
    card: {
      backgroundColor: c.surface,
      marginHorizontal: 10, marginVertical: 4,
      borderRadius: 8, elevation: 1,
      borderLeftWidth: 3,
    },
    cardContent: { padding: 10 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionIcon: { fontSize: 15 },
    action: { fontSize: 13, fontWeight: '500', color: c.onSurface },
    time: { fontSize: 11, color: c.onSurfaceVariant },
    meta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 4 },
    target: { fontSize: 10, color: c.onSurfaceVariant, marginTop: 2, fontFamily: 'monospace' },
    note: { fontSize: 12, color: c.onSurface, marginTop: 4, lineHeight: 17 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
  }));
  const styles = useStyles();

  const [logs, setLogs] = useState<AdminActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await AdminApi.listAuditLog({ limit: 100, action: actionFilter });
      setLogs(r.logs); setTotal(r.total);
    } catch (e: any) { setError(e?.message || '加载失败'); }
    finally { setLoading(false); }
  }, [actionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && logs.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (error && logs.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error" size={48} color={colors.error} style={{ marginBottom: 8 }} />
        <Text style={styles.error}>{error}</Text>
        <Button mode="outlined" onPress={fetchData}>重试</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 筛选条（flexWrap 替代 ScrollView horizontal，规避 RNW web 布局 bug） */}
      <View style={styles.filterRow}>
        <Chip
          compact
          textStyle={{ fontWeight: '400', fontSize: 11 }}
          style={{
            marginRight: 4, marginBottom: 4,
            backgroundColor: !actionFilter ? colors.primary + '18' : colors.surfaceVariant,
            borderColor: !actionFilter ? colors.primary : 'transparent',
          }}
          onPress={() => setActionFilter(undefined)}
        >全部</Chip>
        {Object.entries(ACTION_LABELS).map(([k, v]) => (
          <Chip
            key={k}
            compact
            textStyle={{ fontWeight: '400', fontSize: 11 }}
            style={{
              marginRight: 4, marginBottom: 4,
              backgroundColor: actionFilter === k ? colors.primary + '18' : colors.surfaceVariant,
              borderColor: actionFilter === k ? colors.primary : 'transparent',
            }}
            onPress={() => setActionFilter(k)}
          >{v}</Chip>
        ))}
      </View>

      {/* 统计行 */}
      <View style={styles.statsRow}>
        <MaterialIcons name="history" size={14} color={colors.onSurfaceVariant} />
        <Text style={styles.statsText}>共 {total} 条操作记录</Text>
        {actionFilter ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Chip compact>{ACTION_LABELS[actionFilter]}</Chip>
            <IconButton icon="close" size={14} onPress={() => setActionFilter(undefined)} style={{ padding: 2 }} />
          </View>
        ) : null}
      </View>

      {/* 日志列表 */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        {logs.length === 0 ? (
          <Text style={{ textAlign: 'center', padding: 32, color: colors.onSurfaceVariant, fontSize: 13 }}>
            无审计记录
          </Text>
        ) : logs.map((l) => {
          const color = ACTION_COLORS[l.action] || colors.onSurfaceVariant;
          const icon = ACTION_ICONS[l.action] || 'check';
          return (
            <View key={l.id} style={[styles.card, { borderLeftColor: color }]}>
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={styles.actionRow}>
                    <MaterialIcons name={icon as any} size={15} color={color} />
                    <Text style={[styles.action, { color }]}>{ACTION_LABELS[l.action] || l.action}</Text>
                  </View>
                  <Text style={styles.time}>{new Date(l.createdAt).toLocaleString('zh-CN')}</Text>
                </View>
                <Text style={styles.target}>
                  {l.targetType}#{l.targetId.slice(0, 8)}
                  {l.targetUserId ? ` → user#${l.targetUserId.slice(0, 8)}` : ''}
                </Text>
                {l.admin ? (
                  <Text style={styles.meta}>
                    <MaterialIcons name="person" size={10} color={colors.onSurfaceVariant} style={{ marginRight: 3 }} />
                    {l.admin.phone || l.admin.email || l.admin.nickname || l.admin.id.slice(0, 8)}
                    {l.ipAddress ? ` · ${l.ipAddress}` : ''}
                  </Text>
                ) : null}
                {l.note ? <Text style={styles.note}>{l.note}</Text> : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
