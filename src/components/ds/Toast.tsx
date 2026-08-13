/**
 * Toast —— 全局轻量通知。
 *
 * 替代 Alert.alert() 的常见场景（成功 / 失败 / 信息）。
 * 通过 useToast() hook 触发；Provider 在 ThemeProvider 内。
 *
 * 用法：
 *   const toast = useToast();
 *   toast.show('已保存', { variant: 'success' });
 *   toast.error('网络错误');
 *   toast.success('同步完成');
 *
 * 使用 RN 内置 Animated API，避免 reanimated babel 插件依赖。
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { radius, spacing, palette } from '../../theme/tokens';
import { spring, timing } from '../../theme/motion';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  show: (message: string, opts?: { variant?: ToastVariant; duration?: number }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>((message, opts) => {
    const id = ++idRef.current;
    const item: ToastItem = {
      id,
      message,
      variant: opts?.variant ?? 'info',
      duration: opts?.duration ?? 2400,
    };
    setItems((prev) => [...prev, item]);
  }, []);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, { variant: 'success' }),
    error: (m) => show(m, { variant: 'error' }),
    info: (m) => show(m, { variant: 'info' }),
    warning: (m) => show(m, { variant: 'warning' }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={styles.host}>
        {items.map((it) => (
          <ToastCard key={it.id} item={it} onDone={() => dismiss(it.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

const VARIANT_ICON: Record<ToastVariant, keyof typeof MaterialCommunityIcons.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'information',
  warning: 'alert',
};

const ToastCard: React.FC<{ item: ToastItem; onDone: () => void }> = ({ item, onDone }) => {
  const { colors, dark } = useAppTheme();
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
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
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -80,
          ...timing,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          ...timing,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    }, item.duration);
    return () => clearTimeout(t);
  }, [item, onDone, opacity, translateY]);

  const tint =
    item.variant === 'success'
      ? colors.success
      : item.variant === 'error'
      ? colors.danger
      : item.variant === 'warning'
      ? colors.warning
      : colors.primary;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: dark ? palette.toastBgDark : palette.toastBg,
          borderRadius: radius.lg,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <MaterialCommunityIcons name={VARIANT_ICON[item.variant] as any} size={20} color={tint} />
      <Text style={[styles.text, { color: palette.onPrimary }]} numberOfLines={2}>
        {item.message}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: Platform.select({ ios: 56, android: 36, default: 24 }),
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '90%',
  },
  text: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
