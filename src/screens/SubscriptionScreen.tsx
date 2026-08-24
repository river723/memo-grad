/**
 * 订阅页面：根据 isPro 区分内容。
 * - 免费用户：套餐卡片 → 下单 → dev confirm 轮询（桌面/Web）
 * - Pro 用户：当前订阅状态卡（套餐/到期/配额） + 续费入口
 *
 * 移动端不放支付入口（iOS App Store 数字内容必须走 IAP，绕过会被拒审），
 * 仅 Web 端可用。移动端显示「请在网页版开通」。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Pressable, Platform, Linking } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAppTheme } from '../theme/theme';
import { useAuth } from '../providers/AuthProvider';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import { api } from '../services/ApiClient';
import { WEB_APP_URL } from '../constants';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import AppButton from '../components/ds/AppButton';

type Plan = {
  id: string;
  name: string;
  priceFen: number;
  priceYuan: string;
  days: number;
};

type Order = {
  orderId: string;
  outTradeNo: string;
  plan: string;
  amountFen: number;
  amountYuan: string;
  qrCode: string;
  channel: string;
  status: string;
};

const PLAN_LABELS: Record<string, string> = {
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

function planLabel(key: string | null | undefined): string {
  if (!key) return '会员';
  return PLAN_LABELS[key] ?? '会员';
}

const FEATURES = ['无限 AI 单词分析', 'AI 文章生成', 'AI 真题解析', '导出 / 备份'];

export default function SubscriptionScreen() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const { isPro, entitlement, refreshEntitlement } = useAuth();
  const navigation = useAppNavigation();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Plan[]>('/api/pay/plans');
      setPlans(data);
    } catch (e: any) {
      showConfirm('加载失败', e.message || '无法加载套餐列表', { confirmText: '知道了' }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  useFocusEffect(
    useCallback(() => { refreshEntitlement(); }, [refreshEntitlement])
  );

  const handleOrder = async (planId: string) => {
    try {
      const data = await api.post<Order>('/api/pay/orders', { plan: planId, channel: 'wechat' });
      setOrder(data);
    } catch (e: any) {
      showConfirm('下单失败', e.message || '无法创建订单', { confirmText: '知道了' }).catch(() => {});
    }
  };

  const handleDevConfirm = async () => {
    if (!order) return;
    if (!/^https?:\/\//.test(order.qrCode)) {
      showConfirm(
        '当前服务端为生产模式',
        '一键确认支付仅在开发模式服务端可用，请通过正式支付渠道完成付款。',
        { confirmText: '知道了' }
      ).catch(() => {});
      return;
    }
    setPolling(true);
    try {
      const confirmRes = await fetch(order.qrCode, { method: 'GET' });
      if (!confirmRes.ok) {
        throw new Error(`确认失败（HTTP ${confirmRes.status}）`);
      }
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const poll = await api.get<{ status: string }>(`/api/pay/orders/${order.outTradeNo}`);
          if (poll.status === 'paid') {
            showConfirm('订阅成功', 'AI 功能已解锁，可以开始使用了！', { confirmText: '知道了' }).catch(() => {});
            setPolling(false);
            setOrder(null);
            await refreshEntitlement();
            return;
          }
        } catch (pollErr: any) {
          console.warn('[dev confirm] poll error:', pollErr.message);
        }
      }
      showConfirm('支付超时', '等待 60 秒未收到支付确认，请检查网络连接或刷新页面查看订单状态。', {
        confirmText: '知道了',
      }).catch(() => {});
    } catch (e: any) {
      showConfirm('支付确认失败', e.message || '请重试', { confirmText: '知道了' }).catch(() => {});
    } finally {
      setPolling(false);
    }
  };

  const copyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(WEB_APP_URL);
        showConfirm('已复制', '订阅链接已复制到剪贴板', { confirmText: '知道了' }).catch(() => {});
      } else {
        showConfirm('订阅链接', WEB_APP_URL, { confirmText: '知道了' }).catch(() => {});
      }
    } catch {
      showConfirm('订阅链接', WEB_APP_URL, { confirmText: '知道了' }).catch(() => {});
    }
  };

  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
  const t = colors.typography;

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    borderWidth: 1,
  } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: colors.primary, borderRadius: radius.xl }, colors.shadow.card]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: t.caption.size, letterSpacing: 0.6 }}>
            {isPro ? 'Pro 会员' : '订阅方案'}
          </Text>
          <Text style={{ color: colors.onPrimary, fontSize: t.headline.size, lineHeight: t.headline.lineHeight, fontWeight: '700', letterSpacing: -0.3 }}>
            {isPro ? '管理订阅' : '解锁 AI 功能'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: t.bodySm.size, marginTop: 2 }}>
            {isPro
              ? '查看订阅状态与配额，续费或升级。'
              : 'AI 单词分析 · 文章生成 · 出题 · 真题解析'}
          </Text>
        </View>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name={isPro ? 'crown' : 'star'} size={24} color={colors.onPrimary} />
        </View>
      </View>

      {/* Pro 状态卡 + 配额（移动端用 StatStrip） */}
      {isPro && entitlement && (
        <View style={{ marginTop: spacing.lg }}>
          <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <View style={[styles.avatarBadge, { backgroundColor: colors.primaryContainer }]}>
                <MaterialCommunityIcons name="crown" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: t.bodyLg.size, fontWeight: '700', color: colors.onSurface }}>
                  Pro 已开通
                </Text>
                <Text style={{ fontSize: t.caption.size, color: colors.onSurfaceVariant, marginTop: 2 }}>
                  {planLabel(entitlement.plan)}
                  {entitlement.expiresAt && ` · 到期 ${format(new Date(entitlement.expiresAt), 'yyyy-MM-dd')}`}
                </Text>
              </View>
            </View>
            <View style={styles.quotaRow}>
              <View style={styles.quotaItem}>
                <Text style={[styles.quotaNumber, { color: colors.primary }]}>{entitlement.quota.used}</Text>
                <Text style={styles.quotaLabel}>本月已用</Text>
              </View>
              <View style={[styles.quotaDivider, { backgroundColor: colors.outline }]} />
              <View style={styles.quotaItem}>
                <Text style={[styles.quotaNumber, { color: (entitlement.quota.remaining ?? 0) > 0 ? colors.success : colors.onSurface }]}>
                  {entitlement.quota.remaining}
                </Text>
                <Text style={styles.quotaLabel}>剩余次数</Text>
              </View>
              <View style={[styles.quotaDivider, { backgroundColor: colors.outline }]} />
              <View style={styles.quotaItem}>
                <Text style={[styles.quotaNumber, { color: colors.onSurface }]}>{entitlement.quota.monthlyLimit}</Text>
                <Text style={styles.quotaLabel}>月配额</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 套餐区：移动端 vs 桌面端分支 */}
      {isMobile ? (
        <View style={{ marginTop: spacing.lg }}>
          {isPro ? (
            <View style={[surface, { padding: spacing.xl, alignItems: 'center' }, colors.shadow.hairline]}>
              <MaterialCommunityIcons name="shopping" size={40} color={colors.primary} />
              <Text style={{ fontSize: t.bodyLg.size, fontWeight: '600', color: colors.onSurface, marginTop: spacing.sm }}>
                续费或升级套餐
              </Text>
              <Text style={{ fontSize: t.bodySm.size, color: colors.onSurfaceVariant, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 }}>
                App Store 政策限制，请在网页版完成购买。到期前续费，到期时间自动顺延。
              </Text>
              <View style={{ marginTop: spacing.lg, width: '100%' }}>
                <AppButton
                  title="在浏览器中续费"
                  onPress={() => Linking.openURL(WEB_APP_URL)}
                  variant="primary"
                  size="lg"
                  fullWidth
                  leftIcon={<MaterialCommunityIcons name="open-in-new" size={20} color={colors.onPrimary} />}
                />
              </View>
            </View>
          ) : (
            <View style={[surface, { padding: spacing.xl, alignItems: 'center' }, colors.shadow.hairline]}>
              <MaterialCommunityIcons name="monitor" size={48} color={colors.primary} />
              <Text style={{ fontSize: t.title.size, fontWeight: '600', color: colors.onSurface, marginTop: spacing.sm }}>
                请在网页版开通订阅
              </Text>
              <Text style={{ fontSize: t.bodySm.size, color: colors.onSurfaceVariant, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 }}>
                App Store 政策限制，iOS 端暂不提供直接购买入口。请在浏览器中打开网页版完成订阅，回到 App 即可使用。
              </Text>
              <Text style={{ fontSize: t.caption.size, color: colors.tertiary, marginTop: spacing.sm, textAlign: 'center' }}>
                {WEB_APP_URL}
              </Text>
              <View style={{ marginTop: spacing.lg, width: '100%', gap: spacing.sm }}>
                <AppButton
                  title="在浏览器中打开"
                  onPress={() => Linking.openURL(WEB_APP_URL)}
                  variant="primary"
                  size="lg"
                  fullWidth
                  leftIcon={<MaterialCommunityIcons name="open-in-new" size={20} color={colors.onPrimary} />}
                />
                <AppButton
                  title="复制链接"
                  onPress={copyLink}
                  variant="ghost"
                  size="md"
                  fullWidth
                />
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          {isPro && (
            <Text style={{ fontSize: t.body.size, fontWeight: '600', color: colors.onSurface, marginBottom: spacing.sm }}>
              续费或升级
            </Text>
          )}
          {loading ? (
            <Text style={{ color: colors.onSurfaceVariant, textAlign: 'center', paddingVertical: spacing.xl }}>加载套餐中…</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }}>
              {plans.map((plan) => {
                const isRecommended = plan.id === 'monthly';
                return (
                  <View
                    key={plan.id}
                    style={{
                      flex: isRecommended ? 1.15 : 1,
                      minWidth: 140,
                      transform: isRecommended ? [{ scale: 1.04 }] : undefined,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: isRecommended ? colors.primaryContainer : colors.surface,
                        borderWidth: isRecommended ? 1.5 : 1,
                        borderColor: isRecommended ? colors.primary : colors.outline,
                        borderRadius: radius.xl,
                        padding: 20,
                        alignItems: 'center',
                        position: 'relative',
                      }}
                    >
                      {isRecommended && (
                        <View
                          style={{
                            position: 'absolute',
                            top: -10,
                            alignSelf: 'center',
                            backgroundColor: colors.accent,
                            paddingHorizontal: 10,
                            paddingVertical: 3,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: colors.onPrimary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                            最受欢迎
                          </Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface, letterSpacing: 0.2 }}>
                        {plan.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 12 }}>
                        <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '600', marginRight: 2 }}>¥</Text>
                        <Text
                          style={{
                            fontSize: 36,
                            lineHeight: 40,
                            color: colors.primary,
                            fontWeight: '700',
                            fontFamily: 'SourceSerif4, Georgia, serif',
                            letterSpacing: -1,
                          }}
                        >
                          {plan.priceYuan}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 }}>{plan.days}天</Text>
                      <View style={{ marginTop: 14, alignSelf: 'stretch', gap: 6 }}>
                        {FEATURES.map((feat, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 7,
                                backgroundColor: isRecommended ? colors.success : colors.outline,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ color: colors.onPrimary, fontSize: 9, fontWeight: '700' }}>✓</Text>
                            </View>
                            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, flex: 1 }}>{feat}</Text>
                          </View>
                        ))}
                      </View>
                      <Pressable
                        onPress={() => handleOrder(plan.id)}
                        disabled={!!order}
                        style={({ pressed }) => [
                          {
                            marginTop: 16,
                            alignSelf: 'stretch',
                            height: 44,
                            borderRadius: radius.lg,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isRecommended ? colors.primary : 'transparent',
                            borderWidth: isRecommended ? 0 : 1,
                            borderColor: colors.primary,
                            opacity: !!order ? 0.5 : pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '600', color: isRecommended ? colors.onPrimary : colors.primary }}>
                          {isPro ? '续费' : isRecommended ? '立即订阅' : '选择'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* 订单卡（桌面/dev） */}
      {order && !isMobile && (
        <View style={[surface, { padding: spacing.lg, marginTop: spacing.xl, alignItems: 'center' }, colors.shadow.card]}>
          <Text style={{ fontSize: t.title.size, fontWeight: '600', color: colors.onSurface, marginBottom: 12 }}>
            订单已创建
          </Text>
          <Text style={{ fontSize: t.bodySm.size, color: colors.onSurfaceVariant, marginBottom: 16 }}>
            订单号：{order.outTradeNo} | ¥{order.amountYuan}
          </Text>
          <View style={{ backgroundColor: colors.surfaceVariant, padding: 16, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, textAlign: 'center' }}>
              [ 开发模式：模拟二维码 ]
            </Text>
            <Text style={{ fontSize: 11, color: colors.primary, textAlign: 'center', marginTop: 8 }}>
              {order.qrCode.slice(0, 60)}...
            </Text>
          </View>
          <AppButton
            title={polling ? '等待支付确认...' : '确认支付（开发模式）'}
            onPress={handleDevConfirm}
            variant="primary"
            size="lg"
            loading={polling}
            disabled={polling}
            fullWidth
          />
          <View style={{ marginTop: spacing.sm }}>
            <AppButton title="取消订单" onPress={() => setOrder(null)} variant="ghost" size="md" fullWidth />
          </View>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: colors.outline, marginVertical: spacing.xl, opacity: 0.5 }} />

      <AppButton
        title="返回"
        onPress={() => navigation.goBack()}
        variant="secondary"
        size="lg"
        fullWidth
        leftIcon={<MaterialCommunityIcons name="arrow-left" size={20} color={colors.primary} />}
      />

      <Text style={{ fontSize: t.caption.size, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 }}>
        {isPro
          ? '订阅为买断制，到期自动失效，不会自动续费。可随时续费或升级到更长期套餐。'
          : '订阅为买断一个月，到期自动失效，不会自动续费。可随时在网页版续费。'}
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 110,
    gap: 12,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  quotaItem: {
    flex: 1,
    alignItems: 'center',
  },
  quotaDivider: {
    width: 1,
    height: 32,
    opacity: 0.4,
  },
  quotaNumber: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  quotaLabel: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 2,
  },
}));
