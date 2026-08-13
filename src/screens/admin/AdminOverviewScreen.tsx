/**
 * 后台概览 Tab：5 项 KPI。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { makeStyles } from '../../utils/useStyles';
import { AdminApi } from '../../services/AdminApi';
import AdminKpiCard from './components/AdminKpiCard';
import type { AdminStats } from './types';

export default function AdminOverviewScreen() {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 8, paddingBottom: 80 },
    row: { flexDirection: 'row', flexWrap: 'wrap' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    errorIcon: { marginBottom: 8 },
    error: { color: c.error, marginBottom: 12 },
    updated: { fontSize: 11, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 12 },
    signupChart: { marginTop: 16, padding: 8, backgroundColor: c.surface, borderRadius: 4 },
    chartTitle: { fontSize: 12, color: c.onSurfaceVariant, marginBottom: 6 },
    barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 1 },
    bar: { flex: 1, backgroundColor: c.primary, minHeight: 2, borderRadius: 1 },
  }));
  const styles = useStyles();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await AdminApi.getStats());
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (error && !stats) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error" size={48} color={colors.error} style={styles.errorIcon} />
        <Text style={styles.error}>{error}</Text>
        <Button mode="outlined" onPress={fetchData}>重试</Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
      contentContainerStyle={styles.content}
    >
      <View style={styles.row}>
        <AdminKpiCard
          label="本月收入"
          value={`¥${(stats?.monthlyRevenueYuan ?? 0).toFixed(2)}`}
          color="#28a745"
          hint="paid 订单 / 当月"
        />
        <AdminKpiCard
          label="本月新增用户"
          value={stats?.newUsersThisMonth ?? 0}
          color="#007bff"
        />
      </View>
      <View style={styles.row}>
        <AdminKpiCard
          label="7 天内到期"
          value={stats?.expiringSoonCount ?? 0}
          color={stats && stats.expiringSoonCount > 0 ? '#fd7e14' : undefined}
          hint="active 订阅 / 7 天内到期"
        />
        <AdminKpiCard
          label="本月 AI 失败"
          value={stats?.failedAiCallsThisMonth ?? 0}
          color={stats && stats.failedAiCallsThisMonth > 0 ? '#dc3545' : undefined}
        />
      </View>
      <View style={styles.row}>
        <AdminKpiCard label="总用户" value={stats?.totalUsers ?? 0} />
        <AdminKpiCard label="活跃订阅" value={stats?.activeSubscriptions ?? 0} color="#28a745" />
      </View>
      <View style={styles.row}>
        <AdminKpiCard label="AI 调用总数" value={stats?.totalAiCalls ?? 0} hint="历史累计" />
        <AdminKpiCard label="管理员数" value={stats?.adminCount ?? 0} color="#007bff" />
      </View>
      <View style={styles.row}>
        <AdminKpiCard
          label="已封禁用户"
          value={stats?.disabledCount ?? 0}
          color={stats && stats.disabledCount > 0 ? '#dc3545' : undefined}
        />
        <AdminKpiCard
          label="活跃订阅率"
          value={
            stats && stats.totalUsers > 0
              ? `${((stats.activeSubscriptions / stats.totalUsers) * 100).toFixed(1)}%`
              : '0%'
          }
        />
      </View>

      {/* 30 天新增用户折线图（用条状 row 简易可视化） */}
      {stats?.dailySignups30d ? (
        <View style={styles.signupChart}>
          <Text style={styles.chartTitle}>近 30 天每日新增用户</Text>
          <View style={styles.barRow}>
            {stats.dailySignups30d.map((d) => {
              const max = Math.max(1, ...stats.dailySignups30d.map((x) => x.count));
              const heightPct = (d.count / max) * 100;
              return (
                <View
                  key={d.date}
                  style={[styles.bar, { height: `${heightPct}%` as any }]}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {stats?.generatedAt ? (
        <Text style={styles.updated}>
          更新于 {new Date(stats.generatedAt).toLocaleString('zh-CN')}
        </Text>
      ) : null}
    </ScrollView>
  );
}
