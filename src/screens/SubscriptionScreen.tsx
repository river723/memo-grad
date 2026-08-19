/**
 * 订阅页面：根据 isPro 区分内容。
 * - 免费用户：套餐卡片 → 下单 → dev confirm 轮询
 * - Pro 用户：当前订阅状态卡（套餐/到期/配额） + 续费入口
 *
 * 移动端不放支付入口（iOS App Store 数字内容必须走 IAP，绕过会被拒审），
 * 仅 Web 端可用。移动端显示「请在网页版开通」。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Alert, Platform, Linking } from 'react-native';
import { Card, Text, Button, Divider } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAppTheme } from '../theme/theme';
import { useAuth } from '../providers/AuthProvider';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { api } from '../services/ApiClient';
import { WEB_APP_URL } from '../constants';
import { showConfirm } from '../providers/ConfirmDialogProvider';

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

/** 后端 plan key → 中文标签。跟 server/src/routes/paymentRoutes.ts 的 PLAN_PRICES 对齐 */
const PLAN_LABELS: Record<string, string> = {
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

function planLabel(key: string | null | undefined): string {
  if (!key) return '会员';
  return PLAN_LABELS[key] ?? '会员';
}

export default function SubscriptionScreen() {
  const { colors } = useAppTheme();
  const { isPro, entitlement, refreshEntitlement } = useAuth();
  const navigation = useAppNavigation();
  const useStyles = makeStyles(() => ({}));
  const styles = useStyles();

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

  // 每次进入页面都重新拉一次 entitlement（处理从 /me 回来或 dev confirm 之后的状态滞后）
  useFocusEffect(
    useCallback(() => { refreshEntitlement(); }, [refreshEntitlement])
  );

  // 下单
  const handleOrder = async (planId: string) => {
    try {
      const data = await api.post<Order>('/api/pay/orders', { plan: planId, channel: 'wechat' });
      setOrder(data);
    } catch (e: any) {
      showConfirm('下单失败', e.message || '无法创建订单', { confirmText: '知道了' }).catch(() => {});
    }
  };

  // 开发模式：一键确认支付
  const handleDevConfirm = async () => {
    if (!order) return;
    setPolling(true);
    try {
      // 打开确认链接
      if (typeof window !== 'undefined') {
        window.open(order.qrCode, '_blank');
      }
      // 轮询订单状态（每 2 秒一次，最多 60 秒）
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
          // 轮询期间网络错误，不立即退出，等待下一次轮询
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

  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.onSurface, marginBottom: 8, marginTop: 24 }}>
        {isPro ? '管理订阅' : '解锁 AI 功能'}
      </Text>
      <Text style={{ fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 24 }}>
        {isPro
          ? '查看当前订阅状态、配额使用情况，或续费 / 升级到更长期套餐。'
          : '订阅后可无限制使用 AI 单词分析、文章生成、AI 出题、真题解析等全部 AI 功能。'}
      </Text>

      {/* 当前订阅状态卡 — 仅 Pro 用户展示 */}
      {isPro && entitlement && (
        <Card style={{ marginBottom: 24, backgroundColor: colors.primaryContainer }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <MaterialIcons name="verified-user" size={28} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onPrimaryContainer }}>
                  Pro 已开通
                </Text>
                <Text style={{ fontSize: 13, color: colors.onPrimaryContainer, marginTop: 2 }}>
                  {planLabel(entitlement.plan)}
                  {entitlement.expiresAt && ` · 到期 ${format(new Date(entitlement.expiresAt), 'yyyy-MM-dd')}`}
                </Text>
              </View>
            </View>
            <Divider style={{ backgroundColor: colors.onPrimaryContainer, opacity: 0.2, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.onPrimaryContainer }}>
                  {entitlement.quota.used}
                </Text>
                <Text style={{ fontSize: 12, color: colors.onPrimaryContainer, opacity: 0.8, marginTop: 2 }}>
                  本月已用
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.onPrimaryContainer, opacity: 0.2 }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.onPrimaryContainer }}>
                  {entitlement.quota.remaining}
                </Text>
                <Text style={{ fontSize: 12, color: colors.onPrimaryContainer, opacity: 0.8, marginTop: 2 }}>
                  剩余次数
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.onPrimaryContainer, opacity: 0.2 }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.onPrimaryContainer }}>
                  {entitlement.quota.monthlyLimit}
                </Text>
                <Text style={{ fontSize: 12, color: colors.onPrimaryContainer, opacity: 0.8, marginTop: 2 }}>
                  月配额
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* 套餐区：移动端 vs 桌面端分支 */}
      {isMobile ? (
        isPro ? (
          // 移动端 Pro 用户：当前订阅卡已在上方显示，套餐区给"去网页版续费"按钮
          <Card style={{ marginBottom: 16 }}>
            <Card.Content style={{ alignItems: 'center', padding: 20 }}>
              <MaterialIcons name="shopping-cart" size={40} color={colors.primary} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface, marginTop: 12 }}>
                续费或升级套餐
              </Text>
              <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                App Store 政策限制，请在网页版完成购买。当前订阅到期前任意时刻续费，到期时间会自动顺延。
              </Text>
              <Button
                mode="contained"
                icon="open-in-new"
                onPress={() => Linking.openURL(WEB_APP_URL)}
                style={{ marginTop: 16 }}
              >
                在浏览器中续费
              </Button>
            </Card.Content>
          </Card>
        ) : (
          // 移动端免费用户：原占位卡
          <Card style={{ marginBottom: 16 }}>
            <Card.Content style={{ alignItems: 'center', padding: 24 }}>
              <MaterialIcons name="laptop" size={48} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onSurface, marginTop: 12 }}>
                请在网页版开通订阅
              </Text>
              <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                App Store 政策限制，iOS 端暂不提供直接购买入口。请在浏览器中打开网页版完成订阅，回到 App 即可使用。
              </Text>
              <Text style={{ fontSize: 12, color: colors.tertiary, marginTop: 12, textAlign: 'center' }}>
                {WEB_APP_URL}
              </Text>
              <Button
                mode="contained"
                icon="open-in-new"
                onPress={() => Linking.openURL(WEB_APP_URL)}
                style={{ marginTop: 16 }}
              >
                在浏览器中打开
              </Button>
              <Button
                mode="text"
                onPress={async () => {
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
                }}
                style={{ marginTop: 4 }}
              >
                复制链接
              </Button>
            </Card.Content>
          </Card>
        )
      ) : (
        <View>
          {/* 桌面端 Pro 用户：套餐区上方加"续费"小标题 */}
          {isPro && (
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface, marginBottom: 8 }}>
              续费或升级
            </Text>
          )}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'stretch',
            }}
          >
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
                  <Card
                    style={{
                      flex: 1,
                      backgroundColor: isRecommended ? colors.primaryContainer : colors.surface,
                      borderWidth: isRecommended ? 1.5 : 1,
                      borderColor: isRecommended ? colors.primary : colors.outline,
                      borderRadius: 16,
                    }}
                  >
                    <Card.Content style={{ alignItems: 'center', padding: 20, position: 'relative' }}>
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
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: colors.onSurface,
                          letterSpacing: 0.2,
                        }}
                      >
                        {plan.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 12 }}>
                        <Text
                          style={{
                            fontSize: 18,
                            color: colors.primary,
                            fontWeight: '600',
                            marginRight: 2,
                          }}
                        >
                          ¥
                        </Text>
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
                      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 }}>
                        {plan.days}天
                      </Text>
                      {/* 特性列表 */}
                      <View style={{ marginTop: 14, alignSelf: 'stretch', gap: 6 }}>
                        {[
                          '无限 AI 单词分析',
                          'AI 文章生成',
                          'AI 真题解析',
                          '导出 / 备份',
                        ].map((feat, i) => (
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
                      <Button
                        mode={isRecommended ? 'contained' : 'outlined'}
                        onPress={() => handleOrder(plan.id)}
                        disabled={!!order}
                        style={{ marginTop: 16, alignSelf: 'stretch' }}
                      >
                        {isPro ? '续费' : isRecommended ? '立即订阅' : '选择'}
                      </Button>
                    </Card.Content>
                  </Card>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {order && !isMobile && (
        <Card style={{ marginTop: 24 }}>
          <Card.Content style={{ alignItems: 'center', padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.onSurface, marginBottom: 12 }}>
              订单已创建
            </Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 16 }}>
              订单号：{order.outTradeNo} | ¥{order.amountYuan}
            </Text>
            <View style={{
              backgroundColor: '#fff',
              padding: 16,
              borderWidth: 1,
              borderColor: colors.outline,
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, textAlign: 'center' }}>
                [ 开发模式：模拟二维码 ]
              </Text>
              <Text style={{ fontSize: 11, color: colors.primary, textAlign: 'center', marginTop: 8 }}>
                {order.qrCode.slice(0, 60)}...
              </Text>
            </View>
            <Button
              mode="contained"
              onPress={handleDevConfirm}
              loading={polling}
              disabled={polling}
            >
              {polling ? '等待支付确认...' : '确认支付（开发模式）'}
            </Button>
            <Button
              mode="text"
              onPress={() => setOrder(null)}
              style={{ marginTop: 8 }}
            >
              取消订单
            </Button>
          </Card.Content>
        </Card>
      )}

      <Divider style={{ marginVertical: 24 }} />

      <Button
        mode="outlined"
        icon="arrow-left"
        onPress={() => navigation.goBack()}
        style={{ marginBottom: 16 }}
      >
        返回
      </Button>

      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, textAlign: 'center' }}>
        {isPro
          ? '订阅为买断制，到期自动失效，不会自动续费。可随时续费或升级到更长期套餐。'
          : '订阅为买断一个月，到期自动失效，不会自动续费。可随时在网页版续费。'}
      </Text>
    </ScrollView>
  );
}
