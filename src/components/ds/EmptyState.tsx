/**
 * EmptyState —— 空状态展示。
 *
 * 替代散落各屏的"emoji + 文字 + 按钮"三段硬拼。
 *
 *   <EmptyState
 *     icon="book-open-page-variant"
 *     title="还没有生词"
 *     description="从词库添加，或粘贴一段英文让 AI 帮你生成"
 *     actionLabel="添加生词"
 *     onAction={...}
 *   />
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppIcon, { type IconName } from './AppIcon';
import { useAppTheme } from '../../theme/theme';
import { spacing } from '../../theme/tokens';
import AppButton from './AppButton';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  compact?: boolean;
}

export default function EmptyState({
  icon = 'inbox-outline',
  title,
  description,
  actionLabel,
  onAction,
  variant = 'primary',
  compact = false,
}: EmptyStateProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.root,
        { paddingVertical: compact ? spacing.xl : spacing['3xl'] },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: colors.primaryContainer,
            marginBottom: spacing.lg,
          },
        ]}
      >
        <AppIcon
          name={icon}
          size={compact ? 32 : 40}
          color={colors.primary}
        />
      </View>
      <Text
        style={[
          styles.title,
          {
            color: colors.onSurface,
            fontSize: colors.typography.title.size,
            lineHeight: colors.typography.title.lineHeight,
          },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            styles.desc,
            {
              color: colors.onSurfaceVariant,
              fontSize: colors.typography.body.size,
              lineHeight: colors.typography.body.lineHeight,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.lg }}>
          <AppButton title={actionLabel} onPress={onAction} variant={variant} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: 24 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    textAlign: 'center',
    maxWidth: 280,
  },
});
