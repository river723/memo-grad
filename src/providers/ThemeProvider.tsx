import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { MD3Theme } from 'react-native-paper';
import { lightTheme, darkTheme } from '../theme/theme';
import StorageService from '../services/StorageService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// 使用 @expo/vector-icons 替代 react-native-vector-icons
const paperSettings = {
  icon: (props: any) => <MaterialCommunityIcons {...props} />,
};

interface ThemeContextType {
  theme: MD3Theme;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
  const [resolvedTheme, setResolvedTheme] = useState<MD3Theme>(lightTheme);

  // 初始化时加载保存的主题设置
  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const settings = await StorageService.getSettings();
        const savedTheme = settings.theme || 'light';

        // 验证并安全转换字符串为联合类型
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemeMode(savedTheme);
        } else {
          setThemeMode('light'); // 默认值
        }
      } catch (error) {
        console.error('Failed to load saved theme:', error);
        setThemeMode('light'); // 默认值
      }
    };

    loadSavedTheme();
  }, []);

  // 当 themeMode 变化时，重新计算当前主题
  useEffect(() => {
    const currentTheme = themeMode === 'dark' ||
                        (themeMode === 'system' && systemColorScheme === 'dark')
                        ? darkTheme
                        : lightTheme;

    setResolvedTheme(currentTheme);
  }, [themeMode, systemColorScheme]);

  // 保存主题设置到本地存储
  const handleSetThemeMode = async (mode: 'light' | 'dark' | 'system') => {
    try {
      setThemeMode(mode);

      // 保存到设置中
      await StorageService.saveSettings({ theme: mode });
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const contextValue: ThemeContextType = {
    theme: resolvedTheme,
    themeMode,
    setThemeMode: handleSetThemeMode,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <PaperProvider theme={resolvedTheme} settings={paperSettings}>
        {children}
      </PaperProvider>
    </ThemeContext.Provider>
  );
};