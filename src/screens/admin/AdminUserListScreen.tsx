/**
 * 后台用户列表 Tab：搜索 + 筛选 + 跳详情。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Searchbar, Text, Button, List, IconButton, Menu, Divider } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { makeStyles } from '../../utils/useStyles';
import { AdminApi } from '../../services/AdminApi';
import StatusChip from './components/StatusChip';
import UserAvatar from './components/UserAvatar';
import type { UserListItem, ListUsersParams } from './types';

interface Props {
  onSelectUser: (userId: string) => void;
}

export default function AdminUserListScreen({ onSelectUser }: Props) {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
    search: { flex: 1, backgroundColor: c.surface },
    filterButton: { marginLeft: 4 },
    filterChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: c.surfaceVariant, marginRight: 4 },
    list: { paddingBottom: 80 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center' },
    meta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 2 },
    empty: { textAlign: 'center', color: c.onSurfaceVariant, padding: 24 },
  }));
  const styles = useStyles();

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [filters, setFilters] = useState<{ role?: 'user' | 'admin'; disabled?: boolean }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: ListUsersParams = { limit: 100, sort: 'createdAt' };
      if (search.trim()) params.search = search.trim();
      if (filters.role) params.role = filters.role;
      if (filters.disabled !== undefined) params.disabled = filters.disabled;
      const r = await AdminApi.listUsers(params);
      setUsers(r.users);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [search, filters]);

  // 搜索框去抖
  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  if (loading && users.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (error && users.length === 0) {
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
          placeholder="搜索手机号 / 邮箱"
          value={search}
          onChangeText={setSearch}
        />
        <Menu
          visible={filterMenuVisible}
          onDismiss={() => setFilterMenuVisible(false)}
          anchor={
            <IconButton
              icon="filter-variant"
              size={24}
              onPress={() => setFilterMenuVisible(true)}
            />
          }
        >
          <Menu.Item
            onPress={() => { setFilters({}); setFilterMenuVisible(false); }}
            title="全部"
          />
          <Divider />
          <Menu.Item onPress={() => { setFilters({ role: 'user' }); setFilterMenuVisible(false); }} title="仅普通用户" />
          <Menu.Item onPress={() => { setFilters({ role: 'admin' }); setFilterMenuVisible(false); }} title="仅管理员" />
          <Menu.Item onPress={() => { setFilters({ disabled: true }); setFilterMenuVisible(false); }} title="仅已封禁" />
        </Menu>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        <Text style={{ paddingHorizontal: 12, paddingVertical: 4, fontSize: 11, color: colors.onSurfaceVariant }}>
          共 {total} 个用户
        </Text>
        {users.length === 0 ? (
          <Text style={styles.empty}>无匹配用户</Text>
        ) : users.map((u) => (
          <List.Item
            key={u.id}
            onPress={() => onSelectUser(u.id)}
            title={u.phone || u.email || '无联系方式'}
            description={() => (
              <View>
                <View style={styles.row}>
                  <StatusChip kind={u.role === 'admin' ? 'admin' : 'user'} />
                  {u.disabled ? <StatusChip kind="banned" /> : null}
                  {u.isPro ? <StatusChip kind="active" label={u.currentPlan ?? 'Pro'} /> : null}
                </View>
                <Text style={styles.meta}>
                  注册 {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                  {u.lastSyncAt ? ` · 最后同步 ${new Date(u.lastSyncAt).toLocaleDateString('zh-CN')}` : ' · 从未同步'}
                  {` · ${u.totalWords} 词 · AI ${u.aiCallsThisMonth} 次/月`}
                </Text>
              </View>
            )}
            left={() => (
              <View style={{ justifyContent: 'center', marginLeft: 8 }}>
                <UserAvatar name={u.phone || u.email} />
              </View>
            )}
          />
        ))}
      </ScrollView>
    </View>
  );
}
