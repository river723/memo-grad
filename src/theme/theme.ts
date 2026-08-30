import { MD3LightTheme, MD3DarkTheme, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { DefaultTheme, DarkTheme as RNDefaultDarkTheme } from '@react-navigation/native';
import type { Theme as NavTheme } from '@react-navigation/native';
import {
  palette,
  typography,
  elevation,
  shadow,
  statusLight,
  statusDark,
  type StatusPalettes,
  type StatusPalette,
} from './tokens';
import type { StatusKind } from './tokens';

/**
 * 应用颜色 / Token 契约。
 *
 * 结构色（background / surface / text / outline / container …）随主题切换；
 * 语义强调色（accent / success / danger / warning）保持常量，深色背景下仍可读；
 * 排版 / 圆角 / 阴影常量与主题无关（已硬编码 token，无须切换）。
 *
 * 屏幕消费约定：
 *   const { colors, dark } = useAppTheme();
 *   colors.primary                       // 主色 hex
 *   colors.typography.body.size          // 14
 *   colors.status.active.bg              // 当前主题下的 active 背景
 *   colors.shadow.card.shadowOpacity     // 0.06
 *   colors.elevation.raised              // 8
 */
export interface AppColors {
  // 结构色（随主题）
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
  // 细边框色（扁平风格用）
  hairline: string;
  // 语义常量
  accent: string;
  success: string;
  danger: string;
  warning: string;
  // 明确：primary 背景上的文字色（避免到处写 #FFFFFF）
  onPrimary: string;
  onSuccess: string;
  onDanger: string;
  onWarning: string;
  // 新增：状态色（6 状态）
  status: StatusPalettes;
  // 新增：typography token
  typography: typeof typography;
  // 新增：elevation 数值
  elevation: typeof elevation;
  // 新增：shadow 对象
  shadow: typeof shadow;
  // 新增：dark 标志
  dark: boolean;
}

const lightColors: AppColors = {
  background: palette.background,
  surface: palette.surface,
  surfaceVariant: palette.surfaceAlt,
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
  hairline: palette.hairline,
  accent: palette.accent,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,
  onPrimary: palette.onPrimary,
  onSuccess: palette.onPrimary,
  onDanger: palette.onPrimary,
  onWarning: palette.onPrimary,
  status: statusLight,
  typography,
  elevation,
  shadow,
  dark: false,
};

const darkColors: AppColors = {
  background: palette.backgroundDark,
  surface: palette.surfaceDark,
  surfaceVariant: palette.surfaceAltDark,
  primary: '#6FA08C', // 墨绿亮化（暗色下保持可读）
  primaryContainer: '#1E3A2D',
  onPrimaryContainer: '#9CC4AE',
  secondary: '#D8895C', // 赭石亮化
  secondaryContainer: '#3A271F',
  error: '#D26A52',
  errorContainer: '#3A241F',
  onSurface: palette.textPrimaryDark,
  onSurfaceVariant: palette.textSecondaryDark,
  tertiary: palette.textTertiaryDark,
  outline: palette.borderDark,
  hairline: palette.hairlineDark,
  accent: palette.accent,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,
  onPrimary: palette.onPrimary,
  onSuccess: palette.onPrimary,
  onDanger: palette.onPrimary,
  onWarning: palette.onPrimary,
  status: statusDark,
  typography,
  elevation,
  shadow,
  dark: true,
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  dark: false,
  colors: { ...MD3LightTheme.colors, ...lightColors } as any,
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  dark: true,
  colors: { ...MD3DarkTheme.colors, ...darkColors } as any,
};

/** 旧名兼容（App.tsx 此前导入 appTheme）。 */
export const appTheme = lightTheme;

/** 取当前生效的主题颜色 + 是否深色。供所有屏幕/组件消费结构色。 */
export const useAppTheme = () => {
  const theme = useTheme<MD3Theme>();
  const colors = theme.colors as unknown as AppColors;
  return {
    colors,
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

// 重新导出 tokens 的便利 API
export { typography, elevation, shadow, palette };
export type { StatusKind, StatusPalette };
