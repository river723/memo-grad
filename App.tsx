import React, { useState, useEffect, useMemo } from 'react';
import { View, useColorScheme } from 'react-native';
import { Provider as PaperProvider, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation/AppNavigator';
import { lightTheme, darkTheme } from './src/theme/theme';
import type { MD3Theme } from 'react-native-paper';
import StorageService from './src/services/StorageService';
import { ThemeProvider } from './src/providers/ThemeProvider';

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

    setTimeout(() => {
      console.log('App 组件加载完成');
      setIsLoading(false);
    }, 1000);

    return () => {
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
        <AppNavigator />
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
