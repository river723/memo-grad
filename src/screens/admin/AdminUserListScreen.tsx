/**
 * 后台用户列表 Tab：搜索 + 筛选 + 跳详情。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
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
    // 搜索行
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
    // 列表项
    list: { paddingBottom: 20 },
    userRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline,
    },
    userInfo: { flex: 1, marginLeft: 10 },
    userName: { fontSize: 13, fontWeight: '600', color: c.onSurface },
    meta: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    error: { color: c.error, marginBottom: 12 },
    empty: { textAlign: 'center', color: c.onSurfaceVariant, padding: 32, fontSize: 13 },
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
    setLoading(true); setError(null);
    try {
      const params: ListUsersParams = { limit: 100, sort: 'createdAt' };
      if (search.trim()) params.search = search.trim();
      if (filters.role) params.role = filters.role;
      if (filters.disabled !== undefined) params.disabled = filters.disabled;
      const r = await AdminApi.listUsers(params);
      setUsers(r.users); setTotal(r.total);
    } catch (e: any) { setError(e?.message || '加载失败'); }
    finally { setLoading(false); }
  }, [search, filters]);

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
        <MaterialIcons name="people" size={14} color={colors.onSurfaceVariant} />
        <Text style={styles.statsText}>共 {total} 个用户</Text>
      </View>

      {/* 列表 */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.list}
      >
        {users.length === 0 ? (
          <Text style={styles.empty}>无匹配用户</Text>
        ) : users.map((u) => (
          <TouchableOpacity key={u.id} style={styles.userRow} onPress={() => onSelectUser(u.id)}>
            <UserAvatar name={u.phone || u.email} size={40} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{u.phone || u.email || '无联系方式'}</Text>
              <Text style={styles.meta}>
                注册 {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                {u.lastSyncAt ? ` · 同步 ${new Date(u.lastSyncAt).toLocaleDateString('zh-CN')}` : ' · 从未同步'}
                {' · '}
                {u.totalWords} 词 · AI {u.aiCallsThisMonth} 次/月
              </Text>
              <View style={styles.chips}>
                <StatusChip kind={u.role === 'admin' ? 'admin' : 'user'} />
                {u.disabled ? <StatusChip kind="banned" /> : null}
                {u.isPro ? <StatusChip kind="active" label={u.currentPlan ?? 'Pro'} /> : null}
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
