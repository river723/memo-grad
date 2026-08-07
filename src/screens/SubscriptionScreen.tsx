/**
 * 订阅页面：套餐选择 → 扫码支付（开发模式一键确认）→ 轮询订单状态。
 *
 * 移动端暂不放支付入口（iOS App Store 数字内容必须走 IAP，绕过会被拒审），
 * 仅 Web 端可用。移动端显示「请在网页版开通」。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Alert, Platform } from 'react-native';
import { Card, Text, Button, Divider } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/theme';
import { useAuth } from '../providers/AuthProvider';
import { makeStyles } from '../utils/useStyles';
import { api } from '../services/ApiClient';

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

export default function SubscriptionScreen() {
  const { colors } = useAppTheme();
  const { refreshEntitlement } = useAuth();
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
      Alert.alert('加载失败', e.message || '无法加载套餐列表');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // 下单
  const handleOrder = async (planId: string) => {
    try {
      const data = await api.post<Order>('/api/pay/orders', { plan: planId, channel: 'wechat' });
      setOrder(data);
    } catch (e: any) {
      Alert.alert('下单失败', e.message || '无法创建订单');
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
      // 轮询订单状态
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await api.get<{ status: string }>(`/api/pay/orders/${order.outTradeNo}`);
        if (poll.status === 'paid') {
          Alert.alert('订阅成功', 'AI 功能已解锁，可以开始使用了！');
          setPolling(false);
          setOrder(null);
          await refreshEntitlement();
          return;
        }
      }
      Alert.alert('支付超时', '请刷新页面查看订单状态，或重新下单');
    } catch (e: any) {
      Alert.alert('支付确认失败', e.message || '请重试');
    } finally {
      setPolling(false);
    }
  };

  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.onSurface, marginBottom: 8, marginTop: 24 }}>
        解锁 AI 功能
      </Text>
      <Text style={{ fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 24 }}>
        订阅后可无限制使用 AI 单词分析、文章生成、AI 出题、真题解析等全部 AI 功能。
      </Text>

      {isMobile ? (
        <Card style={{ marginBottom: 16 }}>
          <Card.Content style={{ alignItems: 'center', padding: 24 }}>
            <MaterialIcons name="laptop" size={48} color={colors.primary} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onSurface, marginTop: 12 }}>
              请在网页版开通订阅
            </Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
              App Store 政策限制，iOS 端暂不提供直接购买入口。请在电脑浏览器中打开 MemoGrad 网页版完成订阅，回到 App 即可使用。
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {plans.map((plan) => (
            <Card
              key={plan.id}
              style={{
                flex: 1,
                minWidth: 140,
                backgroundColor: plan.id === 'monthly' ? colors.primaryContainer : colors.surface,
                borderWidth: plan.id === 'monthly' ? 2 : 0,
                borderColor: colors.primary,
              }}
            >
              <Card.Content style={{ alignItems: 'center', padding: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                  {plan.name}
                </Text>
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: 8 }}>
                  ¥{plan.priceYuan}
                </Text>
                <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 }}>
                  {plan.days}天
                </Text>
                <Button
                  mode={plan.id === 'monthly' ? 'contained' : 'outlined'}
                  onPress={() => handleOrder(plan.id)}
                  disabled={!!order}
                  style={{ marginTop: 12 }}
                >
                  {plan.id === 'monthly' ? '立即订阅' : '选择'}
                </Button>
              </Card.Content>
            </Card>
          ))}
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

      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, textAlign: 'center' }}>
        订阅为买断一个月，到期自动失效，不会自动续费。可随时在网页版续费。
      </Text>
    </ScrollView>
  );
}
