/**
 * AppButton —— 统一的按钮原语。
 *
 * variant:
 *   primary   墨绿实底 + 白字（主操作）
 *   secondary 白底 + 墨绿描边 + 墨绿字（次操作）
 *   ghost     透明 + 墨绿字（弱操作）
 *   danger    赭石实底 + 白字（危险操作）
 *
 * size:
 *   md  40px 高度（普通）
 *   lg  48px 高度（主 CTA / 数字键盘）
 *
 * loading 时自动禁用 + 显示 ActivityIndicator。
 */
import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { radius, spacing, controlHeight } from '../../theme/tokens';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type AppButtonSize = 'md' | 'lg';

export interface AppButtonProps {
  title: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  testID?: string;
}

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  leftIcon,
  rightIcon,
  testID,
}: AppButtonProps) {
  const { colors } = useAppTheme();

  const containerStyle: ViewStyle = {
    height: controlHeight[size],
    paddingHorizontal: size === 'lg' ? spacing.xl : spacing.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...containerVariantStyle(variant, colors, disabled),
    ...(fullWidth ? { alignSelf: 'stretch' } : {}),
    ...style,
  };

  const textStyle: TextStyle = {
    fontSize: size === 'lg' ? 16 : 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    ...textVariantStyle(variant, colors, disabled),
  };

  return (
    <Pressable
      onPress={loading || disabled ? undefined : onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        containerStyle,
        pressed && !disabled && !loading ? { opacity: 0.85 } : null,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.primary}
        />
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <Text style={textStyle} numberOfLines={1}>
            {title}
          </Text>
          {rightIcon}
        </View>
      )}
    </Pressable>
  );
}

function containerVariantStyle(
  variant: AppButtonVariant,
  colors: ReturnType<typeof useAppTheme>['colors'],
  disabled: boolean,
): ViewStyle {
  const opacity = disabled ? 0.4 : 1;
  switch (variant) {
    case 'primary':
      return { backgroundColor: colors.primary, opacity };
    case 'secondary':
      return {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.primary,
        opacity,
      };
    case 'ghost':
      return { backgroundColor: 'transparent', opacity };
    case 'danger':
      return { backgroundColor: colors.danger, opacity };
  }
}

function textVariantStyle(
  variant: AppButtonVariant,
  colors: ReturnType<typeof useAppTheme>['colors'],
  disabled: boolean,
): TextStyle {
  switch (variant) {
    case 'primary':
      return { color: colors.onPrimary };
    case 'secondary':
      return { color: colors.primary };
    case 'ghost':
      return { color: colors.primary, opacity: disabled ? 1 : 1 };
    case 'danger':
      return { color: colors.onDanger };
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
