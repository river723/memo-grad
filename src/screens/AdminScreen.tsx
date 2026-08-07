/**
 * 管理员仪表盘。
 * 只有当用户 role === 'admin' 时，StatsScreen 的「账号」卡片才会显示「进入后台」链接。
 * 点击后跳转到这里。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Card, Text, Button, Divider, List, Badge } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';

type AdminStats = {
  totalUsers: number;
  activeSubscriptions: number;
  totalAiCalls: number;
};

type User = {
  id: string;
  phone: string | null;
  email: string | null;
  role: 'user' | 'admin';
  disabled: boolean;
  createdAt: string;
};

export default function AdminScreen() {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((colors) => ({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.primary,
      padding: 24,
      paddingTop: 48,
      alignItems: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.onSurface,
    },
    sub: {
      fontSize: 14,
      color: colors.onSurfaceVariant,
      opacity: 0.8,
      marginTop: 4,
    },
    content: {
      flex: 1,
    },
    contentInner: {
      padding: 16,
      paddingBottom: 80,
    },
    card: {
      marginBottom: 16,
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.onSurface,
      marginBottom: 8,
    },
    grid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
    gridItem: {
      alignItems: 'center',
      minWidth: 80,
    },
    label: {
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    value: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.onSurface,
      marginTop: 4,
    },
    divider: {
      height: 1,
      backgroundColor: colors.outline,
      marginVertical: 12,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200,
    },
    error: {
      color: colors.error,
      marginTop: 16,
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderColor: colors.outline,
    },
  }));
  const styles = useStyles();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users?limit=200'),
      ]);

      if (!statsRes.ok) throw new Error(`Stats failed: ${statsRes.status}`);
      if (!usersRes.ok) throw new Error(`Users failed: ${usersRes.status}`);

      setStats(await statsRes.json());
      setUsers(await usersRes.json());
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDisableUser = async (id: string, disabled: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/disable`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('操作失败');
      fetchData();
    } catch (e: any) {
      console.error('Disable user failed:', e);
    }
  };

  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>后台控制台</Text>
        <Text style={styles.sub}>MemoGrad 网络版管理面板</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        contentContainerStyle={styles.contentInner}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <MaterialIcons name="error" size={48} color={colors.error} />
            <Text style={styles.error}>{error}</Text>
            <Button mode="outlined" onPress={fetchData}>重试</Button>
          </View>
        ) : (
          <>
            {/* 概览卡片 */}
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <Text style={styles.label}>总用户</Text>
                    <Text style={styles.value}>{stats?.totalUsers ?? 0}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.label}>活跃订阅</Text>
                    <Text style={styles.value}>{stats?.activeSubscriptions ?? 0}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.label}>AI 调用次数</Text>
                    <Text style={styles.value}>{stats?.totalAiCalls ?? 0}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.label}>后台管理员</Text>
                    <Text style={styles.value}>{adminCount}</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>

            {/* 用户列表 */}
            <Card style={styles.card}>
              <Card.Content>
                <Text style={styles.sectionTitle}>用户管理</Text>
                <Divider style={styles.divider} />
                {users.map(u => (
                  <List.Item
                    key={u.id}
                    title={u.phone || u.email || '无联系方式'}
                    description={
                      u.role === 'admin'
                        ? `[管理员] 手机号: ${u.phone || '无'}`
                        : `${u.disabled ? '[已封禁]' : ''} 注册: ${new Date(u.createdAt).toLocaleDateString()}`
                    }
                    left={() => (
                      <MaterialIcons
                        name={u.role === 'admin' ? 'shield' : 'person'}
                        size={24}
                        color={u.disabled ? colors.error : colors.primary}
                      />
                    )}
                    right={() => u.role !== 'admin' ? (
                      <Button
                        mode="outlined"
                        onPress={() => handleDisableUser(u.id, u.disabled)}
                      >
                        {u.disabled ? '解禁' : '封禁'}
                      </Button>
                    ) : undefined}
                  />
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button mode="contained" icon="logout" onPress={() => {
          // 清除 token，强制回登录页
          localStorage.removeItem('kaoyan_access_token');
          localStorage.removeItem('kaoyan_refresh_token');
          window.location.reload();
        }}>
          退出登录
        </Button>
      </View>
    </View>
  );
}

const styles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    padding: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.onSurface,
  },
  sub: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    opacity: 0.8,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  gridItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  label: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.onSurface,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outline,
    marginVertical: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  error: {
    color: colors.error,
    marginTop: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: colors.outline,
  },
}));