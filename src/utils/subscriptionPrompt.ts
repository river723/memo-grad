/**
 * 跨平台"需要订阅"弹窗。
 *
 * 背景：react-native-web 的 Alert.alert() 是个 no-op stub，web 上完全不弹窗。
 * 这里在 web 走 window.confirm + 自动导航，mobile 走 Alert.alert。
 *
 * 嵌套导航：Subscription 在 StatsStack 里，但调用方在 LearnStack/ReadStack/PracticeStack，
 * 直接 navigation.navigate('Subscription') 会被静默忽略——必须用嵌套语法
 *   navigation.navigate('Stats', { screen: 'Subscription' })
 * 让 React Navigation 先跳到 Stats tab 再入栈 Subscription。
 *
 * 使用：subscriptionPrompt(navigation, 'AI 出题需要订阅')
 */

import { Platform, Alert } from 'react-native';

/** 跨平台弹窗：单按钮"知道了"，可选第二按钮触发导航到订阅页 */
export function subscriptionPrompt(
  navigation: { navigate: (screen: string, params?: any) => void },
  hint: string = 'AI 功能需要会员订阅，是否前往订阅页？'
): void {
  // 跨 Tab 导航：先到 Stats tab，再入栈 Subscription 屏幕
  const goSubscription = () => navigation.navigate('Stats', { screen: 'Subscription' });

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
    if (window.confirm(`需要订阅\n\n${hint}`)) {
      goSubscription();
    }
    return;
  }
  Alert.alert(
    '需要订阅',
    hint,
    [
      { text: '稍后再说', style: 'cancel' },
      { text: '去订阅', onPress: goSubscription },
    ]
  );
}
