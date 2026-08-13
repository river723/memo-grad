/**
 * DifficultyBadge —— 5 档难度徽章。
 *
 * 替代 emoji 星星 "★★★★★"，每档带档位色 + 数字。
 *
 *   <DifficultyBadge level={3} />  // "●●●○○"
 *   <DifficultyBadge level={5} showNumber />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { palette, radius, spacing } from '../../theme/tokens';

export interface DifficultyBadgeProps {
  level: number; // 1-5
  showNumber?: boolean;
  size?: 'sm' | 'md';
}

export default function DifficultyBadge({
  level,
  showNumber = false,
  size = 'md',
}: DifficultyBadgeProps) {
  const { colors } = useAppTheme();
  const safe = Math.max(1, Math.min(5, level));
  const color = palette.difficulty[safe - 1];

  const dotSize = size === 'sm' ? 5 : 7;
  const gap = size === 'sm' ? 2 : 3;
  const fontSize = size === 'sm' ? 11 : 13;

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingHorizontal: showNumber ? spacing.sm : 6,
          paddingVertical: showNumber ? 3 : 2,
          borderRadius: radius.pill,
        },
      ]}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: i < safe ? color : colors.outline,
            opacity: i < safe ? 1 : 0.35,
            marginRight: i < 4 ? gap : 0,
          }}
        />
      ))}
      {showNumber ? (
        <Text
          style={[
            styles.number,
            { color, fontSize, marginLeft: 6, fontWeight: '600' },
          ]}
        >
          {safe}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  number: { letterSpacing: 0.2 },
});
