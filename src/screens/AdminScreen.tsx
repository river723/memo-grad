/**
 * 后台控制台（薄壳 + 自定义顶部 Tab）。
 *
 * 5 个 Tab：概览 / 用户 / 订单 / 审计 / 公告
 * 用户详情是 push 的子页面（不是 Tab）。
 *
 * 不引入 @react-navigation/material-top-tabs：项目里没装，web 兼容性也未必稳。
 * 用纯 ScrollView 横滑按钮替代，简单可靠。
 */

import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
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
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.primary, paddingHorizontal: 12, paddingVertical: 10,
    },
    headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
    headerSub: { color: '#ffffff', fontSize: 11, opacity: 0.85 },
    logoutBtn: { marginLeft: 8 },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderColor: c.outline,
    },
    tab: {
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: c.primary },
    tabLabel: { color: c.onSurfaceVariant, fontSize: 13, fontWeight: '500' },
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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>后台控制台</Text>
          <Text style={styles.headerSub}>MemoGrad 管理面板</Text>
        </View>
        <Text style={styles.logoutBtn} onPress={logout}>
          <Text style={{ color: '#ffffff', fontSize: 12 }}>退出</Text>
        </Text>
      </View>

      {detailUserId ? (
        <AdminUserDetailScreen userId={detailUserId} onBack={backToList} />
      ) : (
        <>
          <ScrollView horizontal style={styles.tabBar} showsHorizontalScrollIndicator={false}>
            {TABS.map((t) => (
              <View
                key={t.key}
                style={[styles.tab, activeTab === t.key ? styles.tabActive : null]}
                onTouchEnd={() => setActiveTab(t.key)}
              >
                <Text style={[styles.tabLabel, activeTab === t.key ? styles.tabLabelActive : null]}>
                  {t.label}
                </Text>
              </View>
            ))}
          </ScrollView>

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
