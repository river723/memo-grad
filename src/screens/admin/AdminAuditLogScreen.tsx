/**
 * 后台审计日志 Tab：所有 admin 写操作记录。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Text, Button, Searchbar, Chip } from 'react-native-paper';
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
  'user.ban': '#dc3545',
  'user.unban': '#28a745',
  'user.set_role': '#007bff',
  'user.reset_password': '#fd7e14',
  'user.force_logout': '#6c757d',
  'user.reset_ai_quota': '#17a2b8',
  'sub.grant': '#28a745',
  'sub.revoke': '#dc3545',
  'sub.refund': '#dc3545',
  'announcement.create': '#6f42c1',
  'announcement.delete': '#6c757d',
};

export default function AdminAuditLogScreen() {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
    search: { flex: 1, backgroundColor: c.surface },
    list: { paddingBottom: 80 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
    card: { backgroundColor: c.surface, marginVertical: 1, padding: 12 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    action: { fontSize: 13, fontWeight: '600', color: c.onSurface },
    time: { fontSize: 11, color: c.onSurfaceVariant },
    meta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 4 },
    note: { fontSize: 12, color: c.onSurface, marginTop: 4 },
    target: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 2, fontFamily: 'monospace' },
  }));
  const styles = useStyles();

  const [logs, setLogs] = useState<AdminActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await AdminApi.listAuditLog({ limit: 100, action: actionFilter });
      setLogs(r.logs);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
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
      <ScrollView horizontal style={styles.searchRow} showsHorizontalScrollIndicator={false}>
        <Chip
          selected={!actionFilter}
          onPress={() => setActionFilter(undefined)}
          style={{ marginRight: 4 }}
        >全部</Chip>
        {Object.entries(ACTION_LABELS).map(([k, v]) => (
          <Chip
            key={k}
            selected={actionFilter === k}
            onPress={() => setActionFilter(k)}
            style={{ marginRight: 4 }}
          >{v}</Chip>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        <Text style={{ paddingHorizontal: 12, paddingVertical: 4, fontSize: 11, color: colors.onSurfaceVariant }}>
          共 {total} 条
        </Text>
        {logs.length === 0 ? (
          <Text style={{ textAlign: 'center', padding: 24, color: colors.onSurfaceVariant }}>无审计记录</Text>
        ) : logs.map((l) => (
          <View key={l.id} style={styles.card}>
            <View style={styles.header}>
              <Text style={[styles.action, { color: ACTION_COLORS[l.action] || colors.onSurface }]}>
                {ACTION_LABELS[l.action] || l.action}
              </Text>
              <Text style={styles.time}>{new Date(l.createdAt).toLocaleString('zh-CN')}</Text>
            </View>
            <Text style={styles.target}>
              {l.targetType}#{l.targetId.slice(0, 8)}
              {l.targetUserId ? ` → user#${l.targetUserId.slice(0, 8)}` : ''}
            </Text>
            {l.admin ? (
              <Text style={styles.meta}>
                操作人：{l.admin.phone || l.admin.email || l.admin.nickname || l.admin.id.slice(0, 8)}
                {l.ipAddress ? ` · ${l.ipAddress}` : ''}
              </Text>
            ) : null}
            {l.note ? <Text style={styles.note}>{l.note}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
