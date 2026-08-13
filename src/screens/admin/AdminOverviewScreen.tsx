/**
 * 后台概览 Tab：KPI 卡片 + 近 30 天新增用户趋势图。
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

// 10 个 KPI 的数据定义，统一 icon / 颜色 / hint
const KPI_DEFS = [
  { key: 'monthlyRevenueYuan', label: '本月收入',   icon: 'attach-money', color: '#2e7d32', hint: 'paid 订单 / 当月' },
  { key: 'newUsersThisMonth',  label: '本月新增用户', icon: 'person-add',   color: '#1565c0', hint: undefined },
  { key: 'expiringSoonCount',  label: '7 天内到期',   icon: 'warning',      color: '#e65100', hint: 'active 订阅' },
  { key: 'failedAiCallsThisMonth', label: '本月 AI 失败', icon: 'cloud-off', color: '#c62828', hint: undefined },
  { key: 'totalUsers',         label: '总用户',        icon: 'people',       color: undefined,  hint: undefined },
  { key: 'activeSubscriptions',label: '活跃订阅',     icon: 'verified',     color: '#2e7d32', hint: undefined },
  { key: 'totalAiCalls',       label: 'AI 调用总数',   icon: 'api',          color: undefined,  hint: '历史累计' },
  { key: 'adminCount',         label: '管理员数',      icon: 'shield',       color: '#1565c0', hint: undefined },
  { key: 'disabledCount',      label: '已封禁用户',    icon: 'block',        color: '#c62828', hint: undefined },
  { key: 'activeRate',         label: '活跃订阅率',    icon: 'percent',      color: undefined,  hint: undefined },
];

export default function AdminOverviewScreen() {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 10, paddingBottom: 40 },
    row: { flexDirection: 'row', flexWrap: 'wrap' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    errorIcon: { marginBottom: 8 },
    error: { color: c.error, marginBottom: 12 },
    updated: { fontSize: 11, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 12 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 },
    signupChart: { marginTop: 8, padding: 12, backgroundColor: c.surface, borderRadius: 10, elevation: 1 },
    chartTitle: { fontSize: 12, color: c.onSurfaceVariant, marginBottom: 8, fontWeight: '600' },
    barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 72, gap: 2 },
    bar: { flex: 1, backgroundColor: c.primary, borderRadius: 2, minHeight: 2, opacity: 0.75 },
    barActive: { opacity: 1 },
    dateLabels: { flexDirection: 'row', marginTop: 4 },
    dateLabel: { flex: 1, alignItems: 'center' },
    dateText: { fontSize: 9, color: c.onSurfaceVariant },
  }));
  const styles = useStyles();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try { setStats(await AdminApi.getStats()); }
    catch (e: any) { setError(e?.message || '加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      {/* 核心指标 */}
      <View style={styles.row}>
        <AdminKpiCard
          label={KPI_DEFS[0].label}
          value={`¥${(stats?.monthlyRevenueYuan ?? 0).toFixed(2)}`}
          color={KPI_DEFS[0].color}
          icon={KPI_DEFS[0].icon}
          hint={KPI_DEFS[0].hint}
        />
        <AdminKpiCard
          label={KPI_DEFS[1].label}
          value={stats?.newUsersThisMonth ?? 0}
          color={KPI_DEFS[1].color}
          icon={KPI_DEFS[1].icon}
        />
      </View>

      <View style={styles.row}>
        <AdminKpiCard
          label={KPI_DEFS[2].label}
          value={stats?.expiringSoonCount ?? 0}
          color={stats && stats.expiringSoonCount > 0 ? KPI_DEFS[2].color : undefined}
          icon={KPI_DEFS[2].icon}
          hint={KPI_DEFS[2].hint}
        />
        <AdminKpiCard
          label={KPI_DEFS[3].label}
          value={stats?.failedAiCallsThisMonth ?? 0}
          color={stats && stats.failedAiCallsThisMonth > 0 ? KPI_DEFS[3].color : undefined}
          icon={KPI_DEFS[3].icon}
        />
      </View>

      {/* 汇总指标 */}
      <Text style={styles.sectionTitle}>汇总</Text>
      <View style={styles.row}>
        <AdminKpiCard label={KPI_DEFS[4].label} value={stats?.totalUsers ?? 0} icon={KPI_DEFS[4].icon} />
        <AdminKpiCard label={KPI_DEFS[5].label} value={stats?.activeSubscriptions ?? 0} color={KPI_DEFS[5].color} icon={KPI_DEFS[5].icon} />
      </View>
      <View style={styles.row}>
        <AdminKpiCard label={KPI_DEFS[6].label} value={stats?.totalAiCalls ?? 0} icon={KPI_DEFS[6].icon} hint={KPI_DEFS[6].hint} />
        <AdminKpiCard label={KPI_DEFS[7].label} value={stats?.adminCount ?? 0} color={KPI_DEFS[7].color} icon={KPI_DEFS[7].icon} />
      </View>
      <View style={styles.row}>
        <AdminKpiCard
          label={KPI_DEFS[8].label}
          value={stats?.disabledCount ?? 0}
          color={stats && stats.disabledCount > 0 ? KPI_DEFS[8].color : undefined}
          icon={KPI_DEFS[8].icon}
        />
        <AdminKpiCard
          label={KPI_DEFS[9].label}
          value={
            stats && stats.totalUsers > 0
              ? `${((stats.activeSubscriptions / stats.totalUsers) * 100).toFixed(1)}%`
              : '0%'
          }
          icon={KPI_DEFS[9].icon}
        />
      </View>

      {/* 趋势图 */}
      {stats?.dailySignups30d ? (
        <View style={styles.signupChart}>
          <Text style={styles.chartTitle}>
            <MaterialIcons name="trending-up" size={13} color={colors.primary} style={{ marginRight: 4 }} />
            近 30 天每日新增用户
          </Text>
          <View style={styles.barRow}>
            {stats.dailySignups30d.map((d) => {
              const max = Math.max(1, ...stats.dailySignups30d.map((x) => x.count));
              const heightPct = (d.count / max) * 100;
              const isLast = d === stats.dailySignups30d[stats.dailySignups30d.length - 1];
              return (
                <View
                  key={d.date}
                  style={[styles.bar, { height: `${heightPct}%` as any, opacity: isLast ? 1 : 0.6 }]}
                />
              );
            })}
          </View>
          <View style={styles.dateLabels}>
            {stats.dailySignups30d.filter((_, i) => i % 5 === 4 || i === 29).map((d) => (
              <View key={d.date} style={styles.dateLabel}>
                <Text style={styles.dateText}>{d.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {stats?.generatedAt ? (
        <Text style={styles.updated}>更新于 {new Date(stats.generatedAt).toLocaleString('zh-CN')}</Text>
      ) : null}
    </ScrollView>
  );
}
