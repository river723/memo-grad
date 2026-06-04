import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Provider as PaperProvider, Text, MD3LightTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation/AppNavigator';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1976D2',
    secondary: '#FF9800',
    background: '#F5F5F5',
    surface: '#FFFFFF',
  },
};

// 使用 @expo/vector-icons 替代 react-native-vector-icons
// react-native-vector-icons 在 Expo SDK 55 + New Architecture 下字体加载可能失败
const paperSettings = {
  icon: (props: any) => <MaterialCommunityIcons {...props} />,
};

// 错误边界组件
function ErrorFallback({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: 18, color: '#F44336', marginBottom: 10 }}>应用加载失败</Text>
      <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
        {error?.message || '未知错误'}
      </Text>
      <Text style={{ fontSize: 12, color: '#999', marginTop: 10 }}>
        请刷新页面或重启应用
      </Text>
    </View>
  );
}

export default function App() {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('App 组件开始加载...');

    // 添加全局错误处理
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

    // 模拟加载过程
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
      <PaperProvider theme={theme} settings={paperSettings}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
          <Text style={{ fontSize: 18, color: '#1976D2' }}>加载中...</Text>
          <Text style={{ fontSize: 14, color: '#666', marginTop: 10 }}>考研英语生词本</Text>
        </View>
      </PaperProvider>
    );
  }

  if (hasError) {
    return (
      <PaperProvider theme={theme} settings={paperSettings}>
        <ErrorFallback error={error!} />
      </PaperProvider>
    );
  }

  try {
    return (
      <PaperProvider theme={theme} settings={paperSettings}>
        <AppNavigator />
      </PaperProvider>
    );
  } catch (err) {
    console.error('App 渲染错误:', err);
    return (
      <PaperProvider theme={theme} settings={paperSettings}>
        <ErrorFallback error={err as Error} />
      </PaperProvider>
    );
  }
}