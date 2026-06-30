import { useMemo } from 'react';
import type { ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { useAppTheme } from '../theme/theme';
import type { AppColors } from '../theme/theme';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * 主题化的 StyleSheet 工厂。
 *
 * 用法：
 *   const useStyles = makeStyles((colors) => ({
 *     container: { backgroundColor: colors.background },
 *     title: { color: colors.onSurface },
 *   }));
 *   function Screen() { const styles = useStyles(); ... }
 *
 * 返回的 styles 已 memo：仅当颜色变化（亮/暗切换）时重建。
 * 颜色未指定主题（如硬编码的语义强调色 #F44336）可原样保留，不受影响。
 *
 * 这取代了静态 `const styles = StyleSheet.create({...})`——后者在模块加载时
 * 固定颜色，无法随主题切换，是 dark 模式割裂的根源。
 */
export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  make: (colors: AppColors) => T
): () => T {
  return function useStyles(): T {
    const { colors } = useAppTheme();
    return useMemo(() => make(colors), [colors]);
  };
}
