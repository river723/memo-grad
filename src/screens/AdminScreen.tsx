/**
 * 后台控制台（单行紧凑导航 + 横排 Tab）。
 *
 * 5 个 Tab：概览 / 用户 / 订单 / 审计 / 公告
 * 用户详情是 push 的子页面（不是 Tab）。
 *
 * 通过 headerShown: false 隐藏 React Navigation 的父级 Stack header，
 * 避免双重导航栏叠加导致过高。
 * 用纯 View 横排替代 ScrollView 水平 tab，规避 web 端 RNW horizontal
 * ScrollView 布局 bug（导致高度异常放大到 470px）。
 */

import React, { useState, useLayoutEffect } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { useAuth } from '../providers/AuthProvider';
import AdminOverviewScreen from './admin/AdminOverviewScreen';
import AdminUserListScreen from './admin/AdminUserListScreen';
import AdminOrderListScreen from './admin/AdminOrderListScreen';
import AdminAuditLogScreen from './admin/AdminAuditLogScreen';
import AdminAnnouncementsScreen from './admin/AdminAnnouncementsScreen';
import AdminUserDetailScreen from './admin/AdminUserDetailScreen';

type Tab = 'overview' | 'users' | 'orders' | 'audit' | 'announcements';

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'overview', label: '概览', icon: 'dashboard' },
  { key: 'users', label: '用户', icon: 'people' },
  { key: 'orders', label: '订单', icon: 'receipt' },
  { key: 'audit', label: '审计', icon: 'history' },
  { key: 'announcements', label: '公告', icon: 'campaign' },
];

export default function AdminScreen() {
  const { colors } = useAppTheme();
  const { logout } = useAuth();
  const navigation = useNavigation();
  // 隐藏父级 Stack header，避免双重导航栏
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    // 单行导航栏：蓝色底，左标题右退出
    nav: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16,
      backgroundColor: c.primary,
    },
    navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navTitle: { color: c.onPrimary, fontSize: 19, fontWeight: '700' },
    navLogout: { marginLeft: 'auto', padding: 4 },
    // 横排 tab：纯 View，无 ScrollView，规避 web 端 RNW horizontal 布局 bug
    tabBar: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline,
      paddingHorizontal: 8,
    },
    tab: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
      flexShrink: 0,
    },
    tabActive: { borderBottomColor: c.primary },
    tabLabel: { color: c.onSurfaceVariant, fontSize: 14, fontWeight: '500' },
    tabLabelActive: { color: c.primary, fontWeight: '700' },
    screen: { flex: 1 },
  }));
  const styles = useStyles();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const goUser = (id: string) => setDetailUserId(id);
  const backToList = () => setDetailUserId(null);

  return (
    <View style={styles.container}>
      {/* 单行导航：品牌 + 退出 */}
      <View style={styles.nav}>
        <View style={styles.navLeft}>
          <MaterialIcons name="admin-panel-settings" size={24} color={styles.navTitle.color} />
          <Text style={styles.navTitle}>管理面板</Text>
        </View>
        <TouchableOpacity style={styles.navLogout} onPress={logout} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="logout" size={24} color={styles.navTitle.color} />
        </TouchableOpacity>
      </View>

      {detailUserId ? (
        <AdminUserDetailScreen userId={detailUserId} onBack={backToList} />
      ) : (
        <>
          {/* Tab 导航栏（纯 View 横排，避免 web 端 ScrollView horizontal 布局 bug） */}
          <View style={styles.tabBar}>
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tab, active ? styles.tabActive : null]}
                  onPress={() => setActiveTab(t.key)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons
                    name={t.icon as any}
                    size={17}
                    color={active ? colors.primary : colors.onSurfaceVariant}
                  />
                  <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 内容区 */}
          <View style={styles.screen}>
            {activeTab === 'overview' ? <AdminOverviewScreen /> : null}
            {activeTab === 'users' ? <AdminUserListScreen onSelectUser={goUser} /> : null}
            {activeTab === 'orders' ? <AdminOrderListScreen onSelectUser={goUser} /> : null}
            {activeTab === 'audit' ? <AdminAuditLogScreen /> : null}
            {activeTab === 'announcements' ? <AdminAnnouncementsScreen /> : null}
          </View>
        </>
      )}
    </View>
  );
}
