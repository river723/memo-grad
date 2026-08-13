/**
 * 后台订单 Tab：跨用户订单列表 + 跳用户详情。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { makeStyles } from '../../utils/useStyles';
import { AdminApi } from '../../services/AdminApi';
import StatusChip from './components/StatusChip';
import type { OrderListItem, ListOrdersParams } from './types';

interface Props {
  onSelectUser: (userId: string) => void;
}

export default function AdminOrderListScreen({ onSelectUser }: Props) {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    // 搜索栏
    searchRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 10, paddingVertical: 6,
      backgroundColor: c.surfaceVariant, gap: 6,
    },
    searchWrap: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, borderRadius: 8,
      paddingHorizontal: 10, borderWidth: 1, borderColor: c.outline,
    },
    searchText: { flex: 1, fontSize: 13, color: c.onSurface },
    // 统计行
    statsRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 6,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline, gap: 6,
    },
    statsText: { fontSize: 11, color: c.onSurfaceVariant },
    // 订单行
    list: { paddingBottom: 20 },
    orderRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 12,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline, gap: 10,
    },
    orderInfo: { flex: 1 },
    orderTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    orderPlan: { fontSize: 13, fontWeight: '600', color: c.onSurface },
    orderChannel: { fontSize: 11, color: c.onSurfaceVariant },
    orderMeta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 3 },
    orderRight: { alignItems: 'flex-end', gap: 3 },
    amount: { fontSize: 15, fontWeight: '700', color: c.success },
    empty: { textAlign: 'center', color: c.onSurfaceVariant, padding: 32, fontSize: 13 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
  }));
  const styles = useStyles();

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderListItem['status'] | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params: ListOrdersParams = { limit: 100 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const r = await AdminApi.listOrders(params);
      setOrders(r.orders); setTotal(r.total);
    } catch (e: any) { setError(e?.message || '加载失败'); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  if (loading && orders.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (error && orders.length === 0) {
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
      {/* 搜索栏 */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <MaterialIcons name="search" size={17} color={colors.onSurfaceVariant} />
          <Text style={styles.searchText} selectable>{search}</Text>
          {search ? (
            <IconButton icon="close" size={16} onPress={() => setSearch('')} style={{ marginLeft: 4, padding: 2 }} />
          ) : null}
        </View>
      </View>

      {/* 统计行 */}
      <View style={styles.statsRow}>
        <MaterialIcons name="receipt-long" size={14} color={colors.onSurfaceVariant} />
        <Text style={styles.statsText}>共 {total} 笔订单</Text>
        {statusFilter ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <StatusChip kind={statusFilter as any} />
            <IconButton icon="close" size={14} onPress={() => setStatusFilter(undefined)} style={{ padding: 2 }} />
          </View>
        ) : null}
      </View>

      {/* 订单列表 */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        {orders.length === 0 ? (
          <Text style={styles.empty}>无订单</Text>
        ) : orders.map((o) => (
          <View key={o.id} style={styles.orderRow} onTouchEnd={() => onSelectUser(o.userId)}>
            <View style={styles.orderInfo}>
              <View style={styles.orderTop}>
                <Text style={styles.orderPlan}>{o.plan}</Text>
                <Text style={styles.orderChannel}>{o.channel}</Text>
                <StatusChip kind={o.status as any} />
              </View>
              <Text style={styles.orderMeta}>
                {o.userPhone || o.userEmail || o.userId.slice(0, 8)}
                {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleDateString('zh-CN')}` : ''}
              </Text>
            </View>
            <View style={styles.orderRight}>
              <Text style={styles.amount}>¥{(o.amountFen / 100).toFixed(2)}</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.onSurfaceVariant} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
