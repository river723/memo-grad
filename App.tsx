// 必须在所有其它 import 之前：@react-navigation/stack 底层依赖 react-native-gesture-handler，
// 新架构下若未在入口顶部引入并安装，渲染手势组件时会在原生层直接 abort（双端启动闪退）。
import 'react-native-gesture-handler';
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, ScrollView, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation/AppNavigator';
import { lightTheme, darkTheme } from './src/theme/theme';
import type { MD3Theme } from 'react-native-paper';
import StorageService from './src/services/StorageService';
import { ThemeProvider } from './src/providers/ThemeProvider';
import AuthProvider from './src/providers/AuthProvider';
import { AnnouncementProvider } from './src/providers/AnnouncementProvider';
import { ConfirmDialogProvider } from './src/providers/ConfirmDialogProvider';
import { OFFLINE_MODE } from './src/config/appMode';

// 使用 @expo/vector-icons 替代 react-native-vector-icons
// react-native-vector-icons 在 Expo SDK 55 + New Architecture 下字体加载可能失败
const paperSettings = {
  icon: (props: any) => <MaterialCommunityIcons {...props} />,
};

// —— 原生端未捕获异常兜底 ——
// RN Release 构建中未捕获 JS 异常会直接崩溃（ExceptionsManager.reportFatalException
// → RCTFatal → abort），设备上无任何提示、只能事后分析 .ips。这里尽早接管全局异常：
// - Release：捕获后渲染到 ErrorFallback，并持久化一条记录供下次启动排查
// - 开发态：交还默认处理器，保留红盒（LogBox）行为
let startupFatal: { message: string; stack?: string; at: string } | null = null;
let renderFatal: ((error: Error) => void) | null = null;

const g = globalThis as any;
if (g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === 'function') {
  const prevHandler = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    try {
      const record = {
        message: String((error && error.message) || error),
        stack: error && error.stack ? String(error.stack) : undefined,
        at: new Date().toISOString(),
      };
      if (__DEV__) {
        prevHandler(error, isFatal);
        return;
      }
      startupFatal = record;
      // 尽力持久化（fire-and-forget），失败不影响兜底展示
      StorageService.persistFatalError({ ...record, isFatal }).catch(() => {});
      const e = new Error(record.message);
      if (record.stack) {
        e.stack = record.stack;
      }
      if (renderFatal) {
        renderFatal(e);
      }
    } catch {
      // 兜底处理器自身绝不能抛错
    }
  });
}

// 错误边界组件
function ErrorFallback({ error, theme }: { error: Error; theme: MD3Theme }) {
  const c = theme.colors as any;
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: c.background }}>
      <Text style={{ fontSize: 18, color: c.error, marginBottom: 10 }}>应用加载失败</Text>
      <Text style={{ fontSize: 14, color: c.onSurfaceVariant, textAlign: 'center' }}>
        {error?.message || '未知错误'}
      </Text>
      {error?.stack ? (
        <ScrollView style={{ alignSelf: 'stretch', maxHeight: 260, marginTop: 12 }} contentContainerStyle={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: c.tertiary, lineHeight: 16 }}>{error.stack}</Text>
        </ScrollView>
      ) : null}
      <Text style={{ fontSize: 12, color: c.tertiary, marginTop: 10 }}>
        请刷新页面或重启应用
      </Text>
    </View>
  );
}

export default function App() {
  // 挂载前（import 阶段等）已发生的未捕获异常：直接进入错误页
  const [hasError, setHasError] = useState(startupFatal != null);
  const [error, setError] = useState<Error | null>(() => {
    if (!startupFatal) {
      return null;
    }
    const e = new Error(startupFatal.message);
    if (startupFatal.stack) {
      e.stack = startupFatal.stack;
    }
    return e;
  });
  const [isLoading, setIsLoading] = useState(true);

  // 在子组件 effect 之前注册兜底 setter（useLayoutEffect 先于所有子组件的被动 effect 执行，
  // 这样即使子组件 useEffect 抛错，也能把错误渲染到错误页而不是停在加载页）。
  useLayoutEffect(() => {
    renderFatal = (e: Error) => {
      setError(e);
      setHasError(true);
      setIsLoading(false);
    };
    return () => {
      renderFatal = null;
    };
  }, []);

  // 启动时读取已保存的主题偏好
  useEffect(() => {
    console.log('App 组件开始加载...');

    // layout effect 注册前的窗口期（子组件 layout effect 抛错等）：此处补一次检查
    if (startupFatal) {
      const e = new Error(startupFatal.message);
      if (startupFatal.stack) {
        e.stack = startupFatal.stack;
      }
      setError(e);
      setHasError(true);
      setIsLoading(false);
      return;
    }

    const handleError = (error: ErrorEvent) => {
      console.error('全局错误:', error);
      setError(error.error || new Error(error.message));
      setHasError(true);
      setIsLoading(false);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('未处理的Promise错误:', event.reason);
      setError(event.reason);
      setHasError(true);
      setIsLoading(false);
    };

    // window.addEventListener 是浏览器 DOM API：React Native 里 global.window 虽存在，
    // 但并没有 addEventListener 方法，直接调用会抛 "undefined is not a function"
    // 并在 effect 挂载阶段导致原生端致命崩溃。仅在真正支持的 web 环境注册。
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
    }

    // 启动即触发 UUID schema 迁移，并让加载页一直显示到迁移完成。
    // StorageService 的每个读写入口也会 await 同一个迁移 Promise（幂等），
    // 这里提前触发只是为了把迁移耗时收进启动加载页，而不是让首屏闪一下空列表。
    let cancelled = false;
    StorageService.ensureMigrated()
      .catch(err => {
        // 迁移失败已在 StorageService 内部兜底（原始数据保留、下次重试），
        // 这里不阻断启动，否则用户会被卡在加载页。
        console.error('启动迁移异常:', err);
      })
      .finally(() => {
        if (!cancelled) {
          console.log('App 组件加载完成');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <PaperProvider theme={lightTheme} settings={paperSettings}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: lightTheme.colors.background }}>
          <Text style={{ fontSize: 18, color: lightTheme.colors.primary }}>加载中...</Text>
          <Text style={{ fontSize: 14, color: lightTheme.colors.onSurfaceVariant, marginTop: 10 }}>{OFFLINE_MODE ? '考研单词·离线版' : '考研单词·在线版'}</Text>
        </View>
      </PaperProvider>
    );
  }

  if (hasError) {
    return (
      <PaperProvider theme={lightTheme} settings={paperSettings}>
        <ErrorFallback error={error!} theme={lightTheme} />
      </PaperProvider>
    );
  }

  try {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <AuthProvider>
            <AnnouncementProvider>
              <ConfirmDialogProvider>
                <AppNavigator />
              </ConfirmDialogProvider>
            </AnnouncementProvider>
          </AuthProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  } catch (err) {
    console.error('App 渲染错误:', err);
    return (
      <PaperProvider theme={lightTheme} settings={paperSettings}>
        <ErrorFallback error={err as Error} theme={lightTheme} />
      </PaperProvider>
    );
  }
}
