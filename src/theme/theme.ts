import { MD3LightTheme, MD3DarkTheme, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { DefaultTheme, DarkTheme as RNDefaultDarkTheme } from '@react-navigation/native';
import type { Theme as NavTheme } from '@react-navigation/native';
import { palette } from './tokens';

/**
 * 应用颜色契约。
 * - 结构色（background/surface/text/outline/container…）：随主题切换。
 * - 语义强调色（accent/success/danger/warning）：保持常量，深色背景下仍鲜亮可读，
 *   不随主题变。难度渐变等仍由 tokens.palette 管理。
 */
export interface AppColors {
  background: string;
  surface: string;
  surfaceVariant: string;
  primary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  error: string;
  errorContainer: string;
  onSurface: string;
  onSurfaceVariant: string;
  tertiary: string;
  outline: string;
  // 语义常量
  accent: string;
  success: string;
  danger: string;
  warning: string;
}

const lightColors: AppColors = {
  background: palette.background,
  surface: palette.surface,
  surfaceVariant: '#FAFAFA',
  primary: palette.primary,
  primaryContainer: palette.primaryLight,
  onPrimaryContainer: palette.primaryDark,
  secondary: palette.accent,
  secondaryContainer: palette.accentLight,
  error: palette.danger,
  errorContainer: palette.dangerLight,
  onSurface: palette.textPrimary,
  onSurfaceVariant: palette.textSecondary,
  tertiary: palette.textTertiary,
  outline: palette.border,
  accent: palette.accent,
  success: palette.success,
  danger: palette.danger,
  warning: palette.accent,
};

const darkColors: AppColors = {
  background: '#121212',
  surface: '#1E1E1E',
  surfaceVariant: '#2A2A2A',
  primary: '#64B5F6',
  primaryContainer: '#1E3A5F',
  onPrimaryContainer: '#90CAF9',
  secondary: '#FFB74D',
  secondaryContainer: '#3E2A14',
  error: '#EF5350',
  errorContainer: '#4A1F22',
  onSurface: '#EAEAEA',
  onSurfaceVariant: '#B0B0B0',
  tertiary: '#808080',
  outline: '#3A3A3A',
  accent: palette.accent,
  success: palette.success,
  danger: palette.danger,
  warning: palette.accent,
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  dark: false,
  colors: { ...MD3LightTheme.colors, ...lightColors },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  dark: true,
  colors: { ...MD3DarkTheme.colors, ...darkColors },
};

/** 旧名兼容（App.tsx 此前导入 appTheme）。 */
export const appTheme = lightTheme;

/** 取当前生效的主题颜色 + 是否深色。供所有屏幕/组件消费结构色。 */
export const useAppTheme = () => {
  const theme = useTheme<MD3Theme>();
  return {
    colors: theme.colors as unknown as AppColors,
    dark: theme.dark,
  };
};

// --- React Navigation 主题映射（Paper 主题 → RN 导航主题） ---

export const lightNavTheme: NavTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    background: lightColors.background,
    card: lightColors.surface,
    text: lightColors.onSurface,
    border: lightColors.outline,
    primary: lightColors.primary,
  },
};

export const darkNavTheme: NavTheme = {
  ...RNDefaultDarkTheme,
  dark: true,
  colors: {
    ...RNDefaultDarkTheme.colors,
    background: darkColors.background,
    card: darkColors.surface,
    text: darkColors.onSurface,
    border: darkColors.outline,
    primary: darkColors.primary,
  },
};
