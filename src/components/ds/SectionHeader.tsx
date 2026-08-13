/**
 * SectionHeader —— 节标题 + 右侧 action。
 *
 * 替代散落各屏的 Card.Title + right=() 重复结构。
 *
 *   <SectionHeader
 *     title="今日回顾"
 *     actionLabel="查看全部"
 *     onAction={...}
 *   />
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { spacing, fontWeight } from '../../theme/tokens';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap | string;
  compact?: boolean;
}

export default function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
  compact = false,
}: SectionHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        {
          marginBottom: compact ? spacing.sm : spacing.md,
          marginTop: compact ? spacing.sm : spacing.lg,
        },
      ]}
    >
      <View style={styles.left}>
        {icon ? (
          <MaterialCommunityIcons
            name={icon as any}
            size={18}
            color={colors.onSurfaceVariant}
            style={{ marginRight: 8 }}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.title,
              {
                color: colors.onSurface,
                fontSize: colors.typography.title.size,
                lineHeight: colors.typography.title.lineHeight,
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                {
                  color: colors.onSurfaceVariant,
                  fontSize: colors.typography.caption.size,
                },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text
            style={[
              styles.action,
              { color: colors.primary, fontSize: colors.typography.bodySm.size },
            ]}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: { fontWeight: '600' as const, letterSpacing: 0.2 },
  subtitle: { fontWeight: '400' as const, marginTop: 2 },
  action: { fontWeight: '500', paddingHorizontal: 4 },
});
