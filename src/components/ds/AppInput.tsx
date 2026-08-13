/**
 * AppInput —— 统一的输入框原语。
 *
 * - label  顶部小标签（caption 11px）
 * - hint   底部辅助说明（caption 灰字）
 * - error  错误状态（赭石描边 + 错误文案）
 * - leftIcon / rightIcon 槽位
 *
 * 替代 Paper TextInput 的常用场景；Paper TextInput 在 RNW 0.21 上
 * 默认 outlined 模式有边距问题，统一改用本组件解决。
 */
import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { radius, spacing } from '../../theme/tokens';

export interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export default function AppInput({
  label,
  hint,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  ...textInputProps
}: AppInputProps) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.danger
    : focused
    ? colors.primary
    : colors.outline;

  const borderWidth = focused || error ? 1.5 : 1;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: colors.onSurfaceVariant, fontSize: colors.typography.caption.size },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor,
            borderWidth,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
        <TextInput
          {...textInputProps}
          style={[
            styles.input,
            {
              color: colors.onSurface,
              fontSize: colors.typography.body.size,
              lineHeight: colors.typography.body.lineHeight,
            },
          ]}
          placeholderTextColor={colors.tertiary}
          onFocus={(e) => {
            setFocused(true);
            textInputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            textInputProps.onBlur?.(e);
          }}
        />
        {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: colors.tertiary }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontWeight: '500', letterSpacing: 0.4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 8,
  },
  input: { flex: 1, paddingVertical: 10 },
  iconLeft: { marginRight: 4 },
  iconRight: { marginLeft: 4 },
  error: { fontSize: 12, marginTop: 2 },
  hint: { fontSize: 12, marginTop: 2 },
});
