/**
 * 全局确认对话框 Provider —— Tauri/移动端通用的"需要订阅"等阻塞式确认。
 *
 * 为什么需要：
 * - Tauri（WebView2）下，tauri-plugin-dialog 的 ask() 在某些情况下不弹窗；
 *   window.confirm 又会与 React Navigation 同步触发后抛出未捕获异常，
 *   被 App.tsx 的 unhandledrejection 兜底替换成"应用加载失败"；
 * - react-native-web 的 Alert.alert() 是 no-op stub。
 *
 * 实现：单例模块状态 + 顶层 Modal 渲染。subscriptionPrompt 等任意位置
 * 调 showConfirm(title, message) 返回 Promise<boolean>，UI 由本 Provider
 * 统一渲染的 RN Modal 弹出（RNW 的 Modal 在所有平台都正常）。
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Button } from 'react-native-paper';
import AppModal from '../components/ds/AppModal';
import { useAppTheme } from '../theme/theme';
import { spacing } from '../theme/tokens';

interface PendingDialog {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  resolve: (v: boolean) => void;
}

// 模块级单例：subscriptionPrompt 是普通函数，不是 hook，没法拿 context
let pending: PendingDialog | null = null;
let listener: () => void = () => {};

/**
 * 弹出确认对话框，返回用户选择（true=确认，false=取消）。
 * 一次只支持一个对话框——多次调用会按顺序排队，pending 替换前一个未处理的对话框，
 * 但这是兜底，正常流程都是串行的。
 */
export function showConfirm(
  title: string,
  message: string,
  options: { confirmText?: string; cancelText?: string } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    pending = {
      title,
      message,
      confirmText: options.confirmText ?? '去订阅',
      cancelText: options.cancelText ?? '稍后再说',
      resolve,
    };
    listener();
  });
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PendingDialog | null>(null);
  const { colors } = useAppTheme();

  useEffect(() => {
    listener = () => {
      // 取一份快照立刻清空 pending，避免 setState 后又触发 listener 死循环
      const next = pending;
      pending = null;
      if (next) setState(next);
    };
    return () => {
      listener = () => {};
    };
  }, []);

  const handleClose = useCallback(
    (result: boolean) => {
      if (state) {
        state.resolve(result);
      }
      setState(null);
    },
    [state]
  );

  return (
    <>
      {children}
      <AppModal
        visible={!!state}
        onClose={() => handleClose(false)}
        contentStyle={{ maxWidth: 380 }}
      >
        <View style={styles.container}>
          <Text style={[styles.title, { color: colors.onSurface }]}>
            {state?.title ?? ''}
          </Text>
          <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>
            {state?.message ?? ''}
          </Text>
          <View style={styles.actions}>
            <Button
              mode="text"
              onPress={() => handleClose(false)}
              style={styles.actionBtn}
              textColor={colors.onSurfaceVariant}
            >
              {state?.cancelText ?? '稍后再说'}
            </Button>
            <Button
              mode="contained"
              onPress={() => handleClose(true)}
              style={styles.actionBtn}
            >
              {state?.confirmText ?? '去订阅'}
            </Button>
          </View>
        </View>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  actionBtn: {
    minWidth: 96,
  },
});
