/**
 * 后台订单 Tab：跨用户订单列表 + 跳用户详情。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Searchbar, Text, Button, IconButton, Menu, Divider } from 'react-native-paper';
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
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
    search: { flex: 1, backgroundColor: c.surface },
    list: { paddingBottom: 80 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: c.surface, marginVertical: 1 },
    title: { fontSize: 13, color: c.onSurface, fontWeight: '500' },
    meta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 2 },
    amount: { fontSize: 14, fontWeight: '600', color: c.onSurface },
    empty: { textAlign: 'center', color: c.onSurfaceVariant, padding: 24 },
  }));
  const styles = useStyles();

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderListItem['status'] | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: ListOrdersParams = { limit: 100 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const r = await AdminApi.listOrders(params);
      setOrders(r.orders);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
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
      <View style={styles.searchRow}>
        <Searchbar
          style={styles.search}
          placeholder="按手机号/邮箱搜"
          value={search}
          onChangeText={setSearch}
        />
        <Menu
          visible={filterMenuVisible}
          onDismiss={() => setFilterMenuVisible(false)}
          anchor={<IconButton icon="filter-variant" onPress={() => setFilterMenuVisible(true)} />}
        >
          <Menu.Item onPress={() => { setStatusFilter(undefined); setFilterMenuVisible(false); }} title="全部状态" />
          <Divider />
          <Menu.Item onPress={() => { setStatusFilter('pending'); setFilterMenuVisible(false); }} title="待支付" />
          <Menu.Item onPress={() => { setStatusFilter('paid'); setFilterMenuVisible(false); }} title="已支付" />
          <Menu.Item onPress={() => { setStatusFilter('refunded'); setFilterMenuVisible(false); }} title="已退款" />
          <Menu.Item onPress={() => { setStatusFilter('closed'); setFilterMenuVisible(false); }} title="已关闭" />
        </Menu>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        <Text style={{ paddingHorizontal: 12, paddingVertical: 4, fontSize: 11, color: colors.onSurfaceVariant }}>
          共 {total} 笔
        </Text>
        {orders.length === 0 ? (
          <Text style={styles.empty}>无订单</Text>
        ) : orders.map((o) => (
          <View key={o.id} style={styles.row} onTouchEnd={() => onSelectUser(o.userId)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{o.plan} · {o.channel}</Text>
              <Text style={styles.meta}>
                {o.userPhone || o.userEmail || o.userId.slice(0, 8)}
                {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleDateString('zh-CN')}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amount}>¥{(o.amountFen / 100).toFixed(2)}</Text>
              <StatusChip kind={o.status as any} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
