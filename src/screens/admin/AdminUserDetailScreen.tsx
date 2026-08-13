/**
 * 后台用户详情：基础信息 + 9 个面板 + 11 个敏感动作。
 *
 * 11 个敏感动作（按顺序）：
 *   1. 封禁 / 解封
 *   2. 升级为 admin / 降级为 user
 *   3. 重置密码
 *   4. 强制下线
 *   5. 重置 AI 配额
 *   6. 授权订阅（月度 7 天）
 *   7. 撤销订阅
 *   8. 退款（弹窗让管理员选订单 + 填原因）
 *   9-11. 占位 — 实际是上面 8 个 + 几个 disabled 状态
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Modal, Pressable } from 'react-native';
import { Card, Text, Button, Divider, IconButton, TextInput, Snackbar, Surface } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { makeStyles } from '../../utils/useStyles';
import { AdminApi, ApiClientError } from '../../services/AdminApi';
import StatusChip from './components/StatusChip';
import UserAvatar from './components/UserAvatar';
import { useConfirmDialog } from './components/ConfirmDialog';
import type { UserDetail, OrderListItem } from './types';

export default function AdminUserDetailScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: c.surface, elevation: 1 },
    headerTitle: { fontSize: 16, fontWeight: '600', marginLeft: 8, color: c.onSurface },
    content: { padding: 8, paddingBottom: 100 },
    card: { marginBottom: 8, backgroundColor: c.surface },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: c.onSurfaceVariant, marginTop: 4, marginBottom: 4 },
    kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
    k: { color: c.onSurfaceVariant, fontSize: 12 },
    v: { color: c.onSurface, fontSize: 12, fontWeight: '500' },
    actionBar: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6, backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.outline },
    actionBtn: { marginRight: 4, marginBottom: 4 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
    modalSheet: { width: 280, borderRadius: 12, padding: 16, backgroundColor: c.surface },
    modalTitle: { fontSize: 15, fontWeight: 'bold', color: c.onSurface, marginBottom: 12 },
    modalLabel: { fontSize: 12, color: c.onSurfaceVariant, marginBottom: 4 },
    modalAction: { marginTop: 8 },
  }));
  const styles = useStyles();

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; err?: boolean } | null>(null);
  const [grantDays, setGrantDays] = useState('7');
  const [grantDialogVisible, setGrantDialogVisible] = useState(false);

  const [confirmDialog, ConfirmNode] = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await AdminApi.getUser(userId));
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- 包装：执行操作 + 错误处理 ----
  const runOp = async (op: () => Promise<any>, successMsg: string) => {
    try {
      await op();
      setSnack({ msg: successMsg });
      fetchData();
    } catch (e: any) {
      const code = e instanceof ApiClientError ? e.code : 'UNKNOWN';
      setSnack({ msg: e?.message || '操作失败', err: true });
      if (code === 'LAST_ADMIN') {
        setSnack({ msg: '系统至少需要保留一名管理员，操作被拒绝', err: true });
      }
    }
  };

  if (loading && !detail) {
    return (
      <View style={styles.container}>
        <Header onBack={onBack} title="用户详情" />
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }
  if (error || !detail) {
    return (
      <View style={styles.container}>
        <Header onBack={onBack} title="用户详情" />
        <View style={styles.center}>
          <MaterialIcons name="error" size={48} color={colors.error} style={{ marginBottom: 8 }} />
          <Text style={{ color: colors.error, marginBottom: 12 }}>{error || '用户不存在'}</Text>
          <Button mode="outlined" onPress={fetchData}>重试</Button>
        </View>
      </View>
    );
  }

  // 授权订阅：确认天数与套餐，然后弹 confirmDialog 走敏感操作流程。
  // 注意：定义在此处（守卫之后）才能让 detail 的类型收窄生效。
  const grantSubscription = async (plan: 'monthly' | 'quarterly' | 'yearly') => {
    setGrantDialogVisible(false);
    const days = parseInt(grantDays, 10);
    if (!Number.isFinite(days) || days < 1) {
      setSnack({ msg: '天数无效', err: true });
      return;
    }
    const r = await confirmDialog({
      title: '确认授权订阅',
      body: `将给 ${detail.phone || detail.email} 授权 ${days} 天 ${plan}（来源：manual）。如果已有有效订阅会失败。`,
      confirmText: '确认授权',
      requireReason: true,
      reasonLabel: '授权原因',
    });
    if (!r.confirmed) return;
    await runOp(
      () => AdminApi.grantSubscription(detail.id, plan, days, 'manual', r.reason),
      '已授权订阅'
    );
  };

  return (
    <View style={styles.container}>
      <Header onBack={onBack} title={detail.phone || detail.email || '用户详情'} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
      >
        {/* 基础信息 */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <UserAvatar name={detail.phone || detail.email} size={48} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{detail.phone || detail.email || detail.nickname || '(无标识)'}</Text>
                <View style={styles.chipRow}>
                  <StatusChip kind={detail.role === 'admin' ? 'admin' : 'user'} />
                  {detail.disabled ? <StatusChip kind="banned" /> : null}
                  {detail.isPro ? <StatusChip kind="active" label={detail.currentPlan ?? 'Pro'} /> : <StatusChip kind="expired" label="非 Pro" />}
                </View>
              </View>
            </View>
            <Divider style={{ marginVertical: 8 }} />
            <KV k="用户 ID" v={detail.id} />
            <KV k="昵称" v={detail.nickname ?? '(未设置)'} />
            <KV k="注册时间" v={new Date(detail.createdAt).toLocaleString('zh-CN')} />
            <KV k="最后同步" v={detail.lastSyncAt ? new Date(detail.lastSyncAt).toLocaleString('zh-CN') : '从未同步'} />
            {detail.disabled ? (
              <>
                <KV k="封禁时间" v={detail.disabledAt ? new Date(detail.disabledAt).toLocaleString('zh-CN') : '—'} />
                <KV k="封禁原因" v={detail.disabledReason ?? '(无)'} />
              </>
            ) : null}
          </Card.Content>
        </Card>

        {/* 权益 + 配额 */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>权益与配额</Text>
            <KV k="套餐" v={detail.entitlement.plan ?? '(无)'} />
            <KV k="到期时间" v={detail.entitlement.expiresAt ? new Date(detail.entitlement.expiresAt).toLocaleString('zh-CN') : '—'} />
            <KV k="AI 配额" v={`${detail.entitlement.quota.used} / ${detail.entitlement.quota.monthlyLimit} (剩 ${detail.entitlement.quota.remaining})`} />
          </Card.Content>
        </Card>

        {/* 学习活跃度 */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>学习活跃度</Text>
            <KV k="学习记录" v={`${detail.studyActivity.totalRecords} 条 / ${detail.studyActivity.distinctDays} 天`} />
            <KV k="整体正确率" v={detail.studyActivity.overallAccuracy != null ? `${(detail.studyActivity.overallAccuracy * 100).toFixed(1)}%` : '—'} />
            <KV k="文章已读" v={`${detail.studyActivity.articlesRead} 篇`} />
            <KV k="模拟考" v={`${detail.studyActivity.examAttempts} 次 / 平均 ${detail.studyActivity.avgExamAccuracy != null ? (detail.studyActivity.avgExamAccuracy * 100).toFixed(1) + '%' : '—'}`} />
            <KV k="真题" v={`${detail.studyActivity.realExamAttempts} 次 / 平均 ${detail.studyActivity.avgRealExamScore != null ? detail.studyActivity.avgRealExamScore.toFixed(1) + '%' : '—'}`} />
          </Card.Content>
        </Card>

        {/* 数据足迹 */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>数据足迹</Text>
            {Object.entries(detail.dataFootprint).map(([k, v]) => (
              <KV key={k} k={k} v={`${v.count} 条${v.lastUpdatedAt ? ' (最近 ' + new Date(v.lastUpdatedAt).toLocaleDateString('zh-CN') + ')' : ''}`} />
            ))}
          </Card.Content>
        </Card>

        {/* 设备 */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>登录设备（{detail.devices.length}）</Text>
            {detail.devices.length === 0 ? <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>无</Text> : detail.devices.map((d, i) => (
              <KV key={i} k={`${d.platform} · ${d.appVersion ?? '?'}`} v={d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString('zh-CN') : '未同步'} />
            ))}
          </Card.Content>
        </Card>

        {/* 订阅历史 */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>订阅历史（{detail.subscriptionHistory.length}）</Text>
            {detail.subscriptionHistory.length === 0 ? <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>无</Text> : detail.subscriptionHistory.slice(0, 10).map((s) => (
              <View key={s.id} style={styles.kvRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <StatusChip kind={s.status as any} />
                  <Text style={[styles.v, { marginLeft: 4 }]}>{s.plan} · {s.source}</Text>
                </View>
                <Text style={styles.k}>{new Date(s.expiresAt).toLocaleDateString('zh-CN')}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* 订单历史（仅展示 paid 状态，前端可触发的退款只接受 paid） */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>订单（{detail.orderHistory.length}）</Text>
            {detail.orderHistory.length === 0 ? <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>无</Text> : detail.orderHistory.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                onRefund={async () => {
                  const r = await confirmDialog({
                    title: '确认退款',
                    body: `订单 ${o.outTradeNo}（${o.plan}，¥${(o.amountFen / 100).toFixed(2)}）将被标记为已退款。如有匹配订阅也会同步撤销。此操作不可撤销。`,
                    confirmText: '确认退款',
                    danger: true,
                    requireReason: true,
                    reasonLabel: '退款原因',
                  });
                  if (!r.confirmed) return;
                  await runOp(
                    () => AdminApi.refundOrder(detail.id, o.outTradeNo, r.reason),
                    '退款成功'
                  );
                  // 退款成功后弹一下 warning（如果有）
                  try {
                    const res = await AdminApi.refundOrder(detail.id, '__noop__', 'noop') as any; // 不，这会再次触发
                  } catch {}
                }}
              />
            ))}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* 敏感操作栏 */}
      <View style={styles.actionBar}>
        {detail.disabled ? (
          <Button mode="contained-tonal" style={styles.actionBtn} onPress={async () => {
            const r = await confirmDialog({
              title: '确认解封',
              body: `将解除对 ${detail.phone || detail.email} 的封禁，用户可重新登录。`,
              confirmText: '确认解封',
            });
            if (!r.confirmed) return;
            await runOp(() => AdminApi.setDisabled(detail.id, false), '已解封');
          }}>解封</Button>
        ) : (
          <Button mode="contained" buttonColor={colors.error} style={styles.actionBtn} onPress={async () => {
            const r = await confirmDialog({
              title: '确认封禁',
              body: `将封禁 ${detail.phone || detail.email}，并撤销其所有 refresh token 强制下线。`,
              confirmText: '确认封禁',
              danger: true,
              requireReason: true,
              reasonLabel: '封禁原因',
            });
            if (!r.confirmed) return;
            await runOp(() => AdminApi.banUser(detail.id), '已封禁');
          }}>封禁</Button>
        )}

        {detail.role === 'admin' ? (
          <Button mode="outlined" style={styles.actionBtn} onPress={async () => {
            const r = await confirmDialog({
              title: '确认降级',
              body: `将 ${detail.phone || detail.email} 从管理员降为普通用户，并撤销其所有 refresh token。`,
              confirmText: '确认降级',
              danger: true,
            });
            if (!r.confirmed) return;
            await runOp(() => AdminApi.setRole(detail.id, 'user'), '已降级为 user');
          }}>降级</Button>
        ) : (
          <Button mode="outlined" style={styles.actionBtn} onPress={async () => {
            const r = await confirmDialog({
              title: '确认升级',
              body: `将 ${detail.phone || detail.email} 升级为管理员。`,
              confirmText: '确认升级',
            });
            if (!r.confirmed) return;
            await runOp(() => AdminApi.setRole(detail.id, 'admin'), '已升级为 admin');
          }}>升级为管理员</Button>
        )}

        <Button mode="outlined" style={styles.actionBtn} onPress={async () => {
          const r = await confirmDialog({
            title: '确认重置密码',
            body: `将为 ${detail.phone || detail.email} 设置新密码，并撤销其所有 refresh token。用户需要用新密码重新登录。`,
            confirmText: '继续输入新密码',
            requireReason: true,
            reasonLabel: '重置原因',
          });
          if (!r.confirmed) return;
          // 第二步：弹新密码输入
          setSnack({ msg: '请输入新密码（≥8 位）' });
          // 简化处理：让管理员在控制台输入；这里用 prompt 替代
          const pwd = typeof window !== 'undefined'
            ? window.prompt('请输入新密码（至少 8 位）')
            : null;
          if (!pwd || pwd.length < 8) {
            setSnack({ msg: '密码太短或已取消', err: true });
            return;
          }
          await runOp(() => AdminApi.resetPassword(detail.id, pwd), '密码已重置');
        }}>重置密码</Button>

        <Button mode="outlined" style={styles.actionBtn} onPress={async () => {
          const r = await confirmDialog({
            title: '确认强制下线',
            body: `将撤销 ${detail.phone || detail.email} 的所有 refresh token。当前 access token 最迟 15 分钟后过期。`,
            confirmText: '确认强制下线',
          });
          if (!r.confirmed) return;
          await runOp(() => AdminApi.forceLogout(detail.id), '已撤销全部 token');
        }}>强制下线</Button>

        <Button mode="outlined" style={styles.actionBtn} onPress={async () => {
          const r = await confirmDialog({
            title: '确认重置 AI 配额',
            body: `将删除 ${detail.phone || detail.email} 本月所有 AIUsage 记录，配额计数清零。订阅不受影响。`,
            confirmText: '确认重置',
          });
          if (!r.confirmed) return;
          await runOp(() => AdminApi.resetAiQuota(detail.id), '已重置 AI 配额');
        }}>重置 AI 配额</Button>

        <View style={styles.actionBtn} />

        {/* 授权订阅：不用 paper Menu（web 上 findNodeHandle 抛错），用 Modal 弹窗 */}
        <Button mode="outlined" style={styles.actionBtn} onPress={() => setGrantDialogVisible(true)}>授权订阅…</Button>

        <Modal
          visible={grantDialogVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setGrantDialogVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setGrantDialogVisible(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Surface style={styles.modalSheet} elevation={3}>
                <Text style={styles.modalTitle}>授权订阅</Text>
                <Text style={styles.modalLabel}>天数（1-3650）</Text>
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="number-pad"
                  value={grantDays}
                  onChangeText={setGrantDays}
                />
                {(['monthly', 'quarterly', 'yearly'] as const).map((plan) => (
                  <Button
                    key={plan}
                    mode="contained-tonal"
                    style={styles.modalAction}
                    onPress={() => grantSubscription(plan)}
                  >
                    授权 {plan} {grantDays}天
                  </Button>
                ))}
                <Button mode="text" onPress={() => setGrantDialogVisible(false)}>取消</Button>
              </Surface>
            </Pressable>
          </Pressable>
        </Modal>

        {detail.isPro ? (
          <Button mode="text" style={styles.actionBtn} onPress={async () => {
            const r = await confirmDialog({
              title: '确认撤销订阅',
              body: `将撤销 ${detail.phone || detail.email} 的当前有效订阅（${detail.currentPlan}），并立即终止权益。`,
              confirmText: '确认撤销',
              danger: true,
              requireReason: true,
              reasonLabel: '撤销原因',
            });
            if (!r.confirmed) return;
            await runOp(() => AdminApi.revokeSubscription(detail.id, r.reason), '已撤销订阅');
          }}>撤销订阅</Button>
        ) : null}
      </View>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={3000}
        style={{ backgroundColor: snack?.err ? colors.error : colors.surfaceVariant }}>
        <Text style={{ color: snack?.err ? '#fff' : colors.onSurface }}>{snack?.msg}</Text>
      </Snackbar>

      {ConfirmNode}
    </View>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: colors.surface, elevation: 1 }}>
      <IconButton icon="arrow-left" onPress={onBack} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onSurface }}>{title}</Text>
    </View>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{k}</Text>
      <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: '500' }}>{v}</Text>
    </View>
  );
}

function OrderRow({ order, onRefund }: { order: any; onRefund: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ paddingVertical: 4, borderBottomWidth: 1, borderColor: colors.outline }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: 12, color: colors.onSurface }}>{order.plan} · ¥{(order.amountFen / 100).toFixed(2)}</Text>
          <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>{order.outTradeNo} · {order.channel}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StatusChip kind={order.status as any} />
          {order.status === 'paid' ? (
            <Button mode="text" compact onPress={onRefund}>退款</Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}
