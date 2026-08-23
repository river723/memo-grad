/**
 * 登录页：手机号 + 验证码。
 *
 * 不做"注册"独立页面——验证码通过即建号（免注册）是转化率最高的流程，
 * 对用户来说只是"验证登录"，不存在"先注册再登录"两步走。
 *
 * 视觉：沉浸式 Hero 品牌区（墨绿贴顶 + 半透明白装饰，呼应首页 Hero 卡语言）
 * + 羊皮纸表单区（AppInput / AppButton，hairline 描边学院风）。
 *
 * 开发模式下验证码回显在表单中，省去真实短信通道。
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../providers/AuthProvider';
import { useAppTheme } from '../theme/theme';
import { palette, typography, fontFamily, spacing, radius } from '../theme/tokens';
import { spring, timingMedium } from '../theme/motion';
import AppInput from '../components/ds/AppInput';
import AppButton from '../components/ds/AppButton';
import AppIcon from '../components/ds/AppIcon';

/** AppInput 顶部标签带高度（caption lineHeight + wrap gap 6），用于无标签控件与输入框对齐。 */
const LABEL_BAND = typography.caption.lineHeight + 6;

export default function LoginScreen() {
  const { login, sendCode } = useAuth();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formError, setFormError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(12)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 进场：Hero 上浮 + 淡入（与首页 Hero 卡同款 spring）
  useEffect(() => {
    Animated.parallel([
      Animated.spring(heroOpacity, { toValue: 1, ...spring, useNativeDriver: true }),
      Animated.spring(heroTranslate, { toValue: 0, ...spring, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroTranslate]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const handleSendCode = async () => {
    setPhoneError('');
    setFormError('');
    if (!phone.trim()) {
      setPhoneError('请输入手机号');
      return;
    }
    setSending(true);
    try {
      const dc = await sendCode(phone.trim());
      setDevCode(dc);
      setCooldown(60);
      Animated.timing(fadeAnim, {
        toValue: 1,
        ...timingMedium,
        useNativeDriver: true,
      }).start();
      cooldownRef.current = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err: any) {
      setFormError(err?.message || '发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const handleLogin = async () => {
    setCodeError('');
    setFormError('');
    if (!code.trim()) {
      setCodeError('请输入验证码');
      return;
    }
    setLoggingIn(true);
    try {
      await login(phone.trim(), code.trim());
    } catch (err: any) {
      setFormError(err?.message || '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Hero 为钉死墨绿（dark 模式 colors.primary 会亮化），状态栏字恒白 */}
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* === Hero 品牌区 === */}
          <Animated.View
            style={[
              styles.hero,
              {
                paddingTop: insets.top + 28,
                opacity: heroOpacity,
                transform: [{ translateY: heroTranslate }],
              },
            ]}
          >
            <View style={styles.heroRing} />
            <View style={styles.heroDot} />
            <View
              style={[
                styles.logoBadge,
                { backgroundColor: colors.surface },
                colors.shadow.card,
              ]}
            >
              <Image
                source={require('../../assets/MemoGrad.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>考研英语生词本</Text>
            <Text style={styles.subtitle}>手机号登录 · 同步学习数据至云端</Text>
          </Animated.View>

          {/* === 表单区 === */}
          <View style={styles.form}>
            <AppInput
              label="手机号"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (phoneError) setPhoneError('');
              }}
              keyboardType="phone-pad"
              error={phoneError}
              leftIcon={<AppIcon name="cellphone" size={20} color={colors.onSurfaceVariant} />}
              containerStyle={styles.grow}
            />

            <View style={styles.codeRow}>
              <AppInput
                label="验证码"
                value={code}
                onChangeText={(t) => {
                  setCode(t);
                  if (codeError) setCodeError('');
                }}
                keyboardType="number-pad"
                maxLength={6}
                error={codeError}
                leftIcon={<AppIcon name="lock-outline" size={20} color={colors.onSurfaceVariant} />}
                containerStyle={styles.grow}
              />
              <AppButton
                title={cooldown > 0 ? `${cooldown}s` : '获取验证码'}
                variant={cooldown > 0 ? 'secondary' : 'primary'}
                size="md"
                onPress={handleSendCode}
                loading={sending}
                disabled={sending || cooldown > 0}
                style={styles.sendBtn}
              />
            </View>

            {devCode && cooldown > 0 && (
              <Animated.View
                style={[
                  styles.devCodeBar,
                  { backgroundColor: colors.status.active.bg, opacity: fadeAnim },
                ]}
              >
                <Text style={[styles.devCodeText, { color: colors.status.active.fg }]}>
                  验证码：{devCode}（开发模式）
                </Text>
              </Animated.View>
            )}

            {formError ? (
              <View style={[styles.formErrorBar, { backgroundColor: colors.errorContainer }]}>
                <AppIcon name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.formErrorText, { color: colors.error }]}>{formError}</Text>
              </View>
            ) : null}

            <AppButton
              title="登 录"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleLogin}
              loading={loggingIn}
              disabled={loggingIn || !code.trim()}
              style={styles.loginBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    backgroundColor: palette.primary,
    paddingBottom: 36,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroRing: {
    position: 'absolute',
    top: -60,
    right: -48,
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 18,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroDot: {
    position: 'absolute',
    bottom: -18,
    left: -14,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logo: {
    width: 46,
    height: 46,
  },
  title: {
    fontSize: typography.headline.size,
    lineHeight: typography.headline.lineHeight,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: fontFamily.serif,
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 6,
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.6,
  },
  form: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  grow: {
    flex: 1,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sendBtn: {
    height: 44,
    marginTop: LABEL_BAND,
  },
  devCodeBar: {
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  devCodeText: {
    textAlign: 'center',
    fontSize: typography.bodySm.size,
  },
  formErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  formErrorText: {
    flex: 1,
    fontSize: typography.bodySm.size,
  },
  loginBtn: {
    marginTop: spacing.lg,
  },
});
