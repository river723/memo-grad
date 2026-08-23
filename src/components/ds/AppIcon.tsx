/**
 * AppIcon —— MaterialCommunityIcons 的防御封装。
 *
 * 解决"图标名不在字体 → 运行时渲染问号"的机制性缺陷：
 * - 编译期：name 类型为 IconName（keyof glyphMap 严格联合），tsc 拦截拼错名；
 * - 运行时：__DEV__ 下 name 不在 glyphMap 则 console.warn + fallback 到 alert-circle-outline
 *   （比问号显眼，开发时易发现），防动态数据（配置/JSON）传入的坏名。
 *
 * 新代码一律用 AppIcon，不要直接用 MaterialCommunityIcons 或 `name as any`。
 */
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TextProps } from 'react-native';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;


const FALLBACK: IconName = 'alert-circle-outline';

export interface AppIconProps extends Omit<TextProps, 'style'> {
  name: IconName;
  size?: number;
  color?: string;
  style?: TextProps['style'];
}

export default function AppIcon({ name, size = 24, color, style, ...rest }: AppIconProps) {
  const valid = name in MaterialCommunityIcons.glyphMap;
  if (__DEV__ && !valid) {
    // eslint-disable-next-line no-console
    console.warn(
      `[AppIcon] 图标名 "${String(name)}" 不在 MaterialCommunityIcons 字体，已 fallback 到 "${FALLBACK}"。请改用合法图标名。`
    );
  }
  return (
    <MaterialCommunityIcons
      name={valid ? name : FALLBACK}
      size={size}
      color={color}
      style={style}
      {...rest}
    />
  );
}
