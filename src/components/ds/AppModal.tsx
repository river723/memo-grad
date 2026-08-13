/**
 * AppModal —— 居中模态弹窗。
 *
 * - 半透明遮罩（暗色下更深）
 * - 内容卡片 scale 0.96 → 1.0 进场
 * - 遮罩点击可关闭（onRequestClose）
 *
 * 替代 react-native-paper 的 Modal（其默认样式无遮罩动效、不便深色适配）。
 * 使用 RN 内置 Animated API，不依赖 react-native-reanimated。
 */
import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  ViewStyle,
  Easing,
} from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { radius, spacing } from '../../theme/tokens';
import { spring, timing } from '../../theme/motion';

export interface AppModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  dismissOnBackdrop?: boolean;
  testID?: string;
}

const SCALE_IN = 0.96;

export default function AppModal({
  visible,
  onClose,
  children,
  contentStyle,
  dismissOnBackdrop = true,
  testID,
}: AppModalProps) {
  const { colors, dark } = useAppTheme();
  const scale = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          ...spring,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          ...timing,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.96,
          ...timing,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          ...timing,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View
          style={[
            styles.backdrop,
            { backgroundColor: dark ? 'rgba(0,0,0,0.7)' : 'rgba(26,29,27,0.45)' },
            { opacity },
          ]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissOnBackdrop ? onClose : undefined}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
              },
              colors.shadow.raised,
              contentStyle,
              { opacity, transform: [{ scale }] },
            ]}
          >
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.xl,
  },
});
