import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { difficultyColor } from '../theme/tokens';
import { palette } from '../theme/tokens';

interface DifficultyDotsProps {
  /** 1-5 */
  difficulty: number;
  /** 整体容器样式，可覆盖间距等 */
  style?: StyleProp<ViewStyle>;
  /** 单个圆点尺寸，默认 8 */
  dotSize?: number;
  /** 圆点水平间距，默认 2 */
  gap?: number;
}

/**
 * 难度指示圆点（1-5）。颜色由 design token 统一管理，替代此前在
 * WordCard / AddWordScreen 中各自重复的 getDifficultyColor + difficultyDots。
 */
export default function DifficultyDots({
  difficulty,
  style,
  dotSize = 8,
  gap = 2,
}: DifficultyDotsProps) {
  const clamped = Math.max(0, Math.min(5, difficulty));
  return (
    <View style={[styles.container, style]}>
      {[1, 2, 3, 4, 5].map(level => (
        <View
          key={level}
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              marginHorizontal: gap,
              backgroundColor: level <= clamped
                ? difficultyColor(level)
                : palette.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    // 尺寸由 props 动态设置
  },
});
