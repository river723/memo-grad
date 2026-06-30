/**
 * 设计 token —— 全局唯一的色彩 / 间距 / 圆角真相源。
 *
 * 现存屏幕 StyleSheet 中仍有大量硬编码十六进制色值，新代码统一引用本文件
 * 的 `palette`，存量按增量方式逐步迁移。后续接通 dark 模式时，只需在此
 * 补充 darkPalette 并让 theme.ts 按设置切换即可（静态 StyleSheet 仍需迁移
 * 为动态取色后 dark 才能完整生效）。
 */

export const palette = {
  // 主色（蓝）
  primary: '#1976D2',
  primaryDark: '#1565C0',
  primaryLight: '#E3F2FD',

  // 强调 / 警示（橙）
  accent: '#FF9800',
  accentDark: '#E65100',
  accentLight: '#FFF3E0',

  // 语义色
  success: '#4CAF50',
  successDark: '#2E7D32',
  successLight: '#E8F5E9',
  danger: '#F44336',
  dangerDark: '#C62828',
  dangerLight: '#FFEBEE',

  // 中性
  background: '#F5F5F5',
  surface: '#FFFFFF',
  border: '#E0E0E0',
  hairline: '#F0F0F0',

  // 文本层级
  textPrimary: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textDisabled: '#CCCCCC',

  // 难度 1→5 渐变（低→高 = 绿→黄→橙→红）
  difficulty: ['#4CAF50', '#8BC34A', '#FF9800', '#FF5722', '#F44336'],
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

/** 按难度 1-5 取对应颜色，越界回退到中性灰。 */
export const difficultyColor = (level: number): string =>
  palette.difficulty[level - 1] ?? palette.textTertiary;
