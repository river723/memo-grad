/**
 * 设计 token —— 全局唯一的色彩 / 排版 / 间距 / 圆角 / 阴影真相源。
 *
 * 美学方向：Refined Utilitarian + 10% Dark Academia 学院骨血
 *   主色  墨绿 #2E5E4E（替代 MD3 默认蓝 #1976D2）
 *   强调  赭石 #C2603A（待复习 / 警告 / 不认识的唯一彩色 hot spot）
 *   成功  #3F7A5C（墨绿浅化）
 *   浅色  羊皮纸 #F4F0E8（替代纯白）
 *   暗色  #161819（替代 #121212）
 *   描边  1px hairline #E5E0D6
 *
 * 现存屏幕 StyleSheet 中仍有部分硬编码十六进制色值，新代码统一引用
 * `palette` / `status` / `typography` / `elevation`，存量按增量方式逐步迁移。
 */

// ======================  色彩  ======================
export const palette = {
  // 主色（墨绿 — 替代 MD3 默认蓝）
  primary: '#2E5E4E',
  primaryDark: '#234B3E',
  primaryLight: '#E6EFEB',

  // 强调（赭石 — 替代 MD3 默认橙）
  accent: '#C2603A',
  accentDark: '#9A4A2A',
  accentLight: '#F6E5DC',

  // 语义色
  success: '#3F7A5C',
  successDark: '#2E5E4E',
  successLight: '#E6EFEB',
  danger: '#B5462E',
  dangerDark: '#8E3522',
  dangerLight: '#F6E5DC',
  warning: '#C2603A',
  warningLight: '#F6E5DC',

  // 中性
  background: '#F4F0E8', // 羊皮纸
  surface: '#FFFFFF',
  surfaceAlt: '#FAF7F1', // 浅色 surface 二级
  border: '#E0DDD4',
  hairline: '#E5E0D6',

  // 暗色中性
  backgroundDark: '#0F1110',
  surfaceDark: '#161819',
  surfaceAltDark: '#1E2120',
  borderDark: '#2A2D2B',
  hairlineDark: '#1F2220',

  // 文本层级
  textPrimary: '#1A1D1B',
  textSecondary: '#5C605C',
  textTertiary: '#8A8E89',
  textDisabled: '#BCBEB9',
  textPrimaryDark: '#EAE6DD',
  textSecondaryDark: '#B0ACA3',
  textTertiaryDark: '#807C74',

  // MD3 角色
  onSurface: '#1A1D1B',
  onSurfaceVariant: '#5C605C',
  error: '#B5462E',

  // 语义色上的文字（primary/success/danger/warning 背景上的白字）
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',

  // Toast 专属深色底（无论主题，toast 恒为深底白字）
  toastBg: '#1A1D1B',
  toastBgDark: '#262A28',

  // 难度 1→5 渐变（绿→黄→橙→红）
  difficulty: ['#3F7A5C', '#7AA85F', '#D4A93A', '#C2603A', '#B5462E'],
} as const;

// ======================  状态配色（6 状态 × light+dark × bg/fg/border）  ======================
export type StatusKind =
  | 'active'
  | 'pending'
  | 'expired'
  | 'refunded'
  | 'closed'
  | 'banned';

export interface StatusPalette {
  bg: string;
  fg: string;
  border: string;
}

export interface StatusPalettes {
  active: StatusPalette;
  pending: StatusPalette;
  expired: StatusPalette;
  refunded: StatusPalette;
  closed: StatusPalette;
  banned: StatusPalette;
}

export const statusLight: StatusPalettes = {
  active: { bg: '#E6EFEB', fg: '#234B3E', border: '#BFD3C9' },
  pending: { bg: '#F6E5DC', fg: '#9A4A2A', border: '#E5C8B6' },
  expired: { bg: '#EFEAE0', fg: '#7A6A4A', border: '#D8CFB7' },
  refunded: { bg: '#F1E4E1', fg: '#8E3522', border: '#D9BDB7' },
  closed: { bg: '#E8E5DD', fg: '#5C605C', border: '#CFCBC2' },
  banned: { bg: '#F1E4E1', fg: '#8E3522', border: '#D9BDB7' },
};

export const statusDark: StatusPalettes = {
  active: { bg: '#1E2D26', fg: '#9CC4AE', border: '#2C4438' },
  pending: { bg: '#3A271F', fg: '#E5B89E', border: '#5A3D32' },
  expired: { bg: '#332D24', fg: '#C9B98D', border: '#4D4536' },
  refunded: { bg: '#3A241F', fg: '#E0A89A', border: '#5A3830' },
  closed: { bg: '#2A2C29', fg: '#A5A29A', border: '#3F413E' },
  banned: { bg: '#3A241F', fg: '#E0A89A', border: '#5A3830' },
};

// ======================  字号 / 行高  ======================
export const typography = {
  caption: { size: 11, lineHeight: 16 },
  bodySm: { size: 13, lineHeight: 20 },
  body: { size: 14, lineHeight: 22 },
  bodyLg: { size: 15, lineHeight: 24 },
  title: { size: 17, lineHeight: 26 },
  headline: { size: 22, lineHeight: 30 },
  display: { size: 32, lineHeight: 40 },
  numeralXl: { size: 56, lineHeight: 64 },
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// ======================  字体族  ======================
export const fontFamily = {
  // 中文标题：思源宋体 SC（衬线，学院骨血）
  serif: 'NotoSerifSC',
  // 中文正文 / 数据：思源黑体 SC
  sans: 'NotoSansSC',
  // 英文 / 单词：Source Serif 4（与中文呼应）
  serifLatin: 'SourceSerif4',
  // 数据 / 等宽
  mono: 'monospace',
} as const;

// ======================  间距  ======================
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

// ======================  圆角  ======================
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

// ======================  阴影 / Elevation  ======================
export const elevation = {
  none: 0,
  hairline: 1,
  card: 2,
  raised: 8,
  overlay: 16,
} as const;

export const shadow = {
  none: {
    shadowOpacity: 0,
    elevation: 0,
  },
  hairline: {
    shadowColor: '#1A1D1B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
    elevation: 1,
  },
  card: {
    shadowColor: '#1A1D1B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  raised: {
    shadowColor: '#1A1D1B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  overlay: {
    shadowColor: '#1A1D1B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 16,
  },
} as const;

// ======================  命中 / 触控尺寸  ======================
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const controlHeight = { sm: 32, md: 40, lg: 48, xl: 56 } as const;

// ======================  工具函数  ======================
/** 按难度 1-5 取对应颜色，越界回退到中性灰。 */
export const difficultyColor = (level: number): string =>
  palette.difficulty[level - 1] ?? palette.textTertiary;

/** 按 StatusKind 取当前主题对应的状态色（已传入完整 palette）。 */
export const statusColor = (
  kind: StatusKind,
  dark: boolean,
): StatusPalette => (dark ? statusDark[kind] : statusLight[kind]);
