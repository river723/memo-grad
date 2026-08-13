/**
 * 全局动效配置 —— 全应用所有动效（Reanimated / Animated / CSS transition）
 * 都从这里取 spring / timing，禁止在屏幕里硬编码 stiffness / duration。
 *
 * 总共 3 spring + 3 timing = 6 种以内，保持视觉一致。
 *
 * 注：本项目因 babel 插件约束使用 RN 内置 Animated，配置对象用普通
 * TypeScript 对象而非 Reanimated 的 WithSpringConfig 类型。
 */

export interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
}

export interface TimingConfig {
  duration?: number;
}

/** 进场、卡片翻转、Hero 缩放。慢但有重量。 */
export const spring: SpringConfig = {
  damping: 18,
  stiffness: 180,
  mass: 1,
};

/** 按钮按压、徽章、计数器。快但有反馈。 */
export const springFast: SpringConfig = {
  damping: 20,
  stiffness: 220,
  mass: 0.8,
};

/** 微奖赏（答对 +1 飘字、shake 复位）。极快。 */
export const springSnap: SpringConfig = {
  damping: 24,
  stiffness: 320,
  mass: 0.6,
};

/** Toast / Snack 滑入滑出。 */
export const timing: TimingConfig = {
  duration: 250,
};

/** progress 填充、图表绘制。 */
export const timingSlow: TimingConfig = {
  duration: 600,
};

/** 屏幕切换、Modal 缩放。 */
export const timingMedium: TimingConfig = {
  duration: 400,
};

/** 极速抖动（shake 单步、微反馈）。 */
export const timingFast: TimingConfig = {
  duration: 60,
};

/** 3D 翻转专用：更慢的 stiffness 让翻面有重量感。 */
export const springFlip: SpringConfig = {
  damping: 18,
  stiffness: 150,
  mass: 1,
};
