/**
 * 跨平台"需要订阅"弹窗。
 *
 * 背景：
 *   - react-native-web 的 Alert.alert() 是个 no-op stub，web 上完全不弹窗；
 *   - window.confirm 在 WebView2 中点击后若同时触发 navigation.navigate，
 *     会导致整个 app 被 App.tsx 的全局 unhandledrejection 兜底替换成
 *     "应用加载失败"；
 *   - tauri-plugin-dialog 的 ask() 在某些 Tauri 版本/构建下不弹窗。
 *
 * 因此三端统一走 [ConfirmDialogProvider] 的全局 RN Modal（fire-and-forget，
 * 不阻塞调用方，调用方都是 catch 块后立即 return）。
 *
 * 嵌套导航：Subscription 在 StatsStack 里，但调用方在 LearnStack/ReadStack/PracticeStack，
 * 直接 navigation.navigate('Subscription') 会被静默忽略——必须用嵌套语法
 *   navigation.navigate('Stats', { screen: 'Subscription' })
 * 让 React Navigation 先跳到 Stats tab 再入栈 Subscription。
 *
 * 使用：subscriptionPrompt(navigation, 'AI 出题需要订阅')
 */

import { showConfirm } from '../providers/ConfirmDialogProvider';

/**
 * 跨平台弹窗：单按钮"知道了"，可选第二按钮触发导航到订阅页
 */
export function subscriptionPrompt(
  navigation: { navigate: (screen: string, params?: any) => void; dispatch: (action: any) => void },
  hint: string = 'AI 功能需要会员订阅，是否前往订阅页？'
): void {
  // 跨 Tab 导航：跳到 Stats tab 并入栈 Subscription 屏幕。
  // 这是 React Navigation 官方支持的嵌套导航语法，三端（web/Tauri/mobile）都工作。
  // 注：点返回会回到"我的"主页（Stats），这是标准行为；若需回到调用页，
  // 调用方可在 subscriptionPrompt 之后自行 goBack 或跳转。
  const goSubscription = () => navigation.navigate('Stats', { screen: 'Subscription' });

  // 三端统一走全局 RN Modal（ConfirmDialogProvider 在 App 根节点挂载）。
  // 异步 + try/catch：避免 .then 回调里的 navigation.navigate 异常逃逸，
  // 被 App.tsx 的全局 unhandledrejection 兜底替换成"应用加载失败"。
  showConfirm('需要订阅', hint, { confirmText: '去订阅', cancelText: '稍后再说' })
    .then(yes => {
      if (yes) {
        try {
          goSubscription();
        } catch (navErr) {
          console.error('[subscriptionPrompt] 跳转订阅页失败:', navErr);
        }
      }
    })
    .catch(dialogErr => {
      console.error('[subscriptionPrompt] 弹窗流程失败:', dialogErr);
    });
}
