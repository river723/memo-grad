import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { MD3Theme } from 'react-native-paper';
import { lightTheme, darkTheme } from '../theme/theme';
import StorageService from '../services/StorageService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ToastProvider } from '../components/ds/Toast';

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

  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const settings = await StorageService.getSettings();
        const savedTheme = settings.theme || 'light';

        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemeMode(savedTheme);
        } else {
          setThemeMode('light');
        }
      } catch (error) {
        console.error('Failed to load saved theme:', error);
        setThemeMode('light');
      }
    };

    loadSavedTheme();
  }, []);

  useEffect(() => {
    const currentTheme = themeMode === 'dark' ||
                        (themeMode === 'system' && systemColorScheme === 'dark')
                        ? darkTheme
                        : lightTheme;

    setResolvedTheme(currentTheme);
  }, [themeMode, systemColorScheme]);

  const handleSetThemeMode = async (mode: 'light' | 'dark' | 'system') => {
    try {
      setThemeMode(mode);
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
        <ToastProvider>{children}</ToastProvider>
      </PaperProvider>
    </ThemeContext.Provider>
  );
};
