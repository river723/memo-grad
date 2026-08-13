import React, { useState, useEffect, useMemo } from 'react';
import { View, useColorScheme } from 'react-native';
import { Provider as PaperProvider, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation/AppNavigator';
import { lightTheme, darkTheme } from './src/theme/theme';
import type { MD3Theme } from 'react-native-paper';
import StorageService from './src/services/StorageService';
import { ThemeProvider } from './src/providers/ThemeProvider';
import AuthProvider from './src/providers/AuthProvider';
import { AnnouncementProvider } from './src/providers/AnnouncementProvider';

// 使用 @expo/vector-icons 替代 react-native-vector-icons
// react-native-vector-icons 在 Expo SDK 55 + New Architecture 下字体加载可能失败
const paperSettings = {
  icon: (props: any) => <MaterialCommunityIcons {...props} />,
};

// 错误边界组件
function ErrorFallback({ error, theme }: { error: Error; theme: MD3Theme }) {
  const c = theme.colors as any;
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: c.background }}>
      <Text style={{ fontSize: 18, color: c.error, marginBottom: 10 }}>应用加载失败</Text>
      <Text style={{ fontSize: 14, color: c.onSurfaceVariant, textAlign: 'center' }}>
        {error?.message || '未知错误'}
      </Text>
      <Text style={{ fontSize: 12, color: c.tertiary, marginTop: 10 }}>
        请刷新页面或重启应用
      </Text>
    </View>
  );
}

export default function App() {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 启动时读取已保存的主题偏好
  useEffect(() => {
    console.log('App 组件开始加载...');

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

    if (typeof window !== 'undefined') {
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
      if (typeof window !== 'undefined') {
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
          <Text style={{ fontSize: 14, color: lightTheme.colors.onSurfaceVariant, marginTop: 10 }}>考研英语生词本</Text>
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
      <ThemeProvider>
        <AuthProvider>
          <AnnouncementProvider>
            <AppNavigator />
          </AnnouncementProvider>
        </AuthProvider>
      </ThemeProvider>
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
