/**
 * 登录页：手机号 + 验证码。
 *
 * 不做"注册"独立页面——验证码通过即建号（免注册）是转化率最高的流程，
 * 对用户来说只是"验证登录"，不存在"先注册再登录"两步走。
 *
 * 开发模式下验证码回显在输入框下方，省去真实短信通道。
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { useAuth } from '../providers/AuthProvider';
import { palette } from '../theme/tokens';

export default function LoginScreen() {
  const { login, sendCode } = useAuth();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const handleSendCode = async () => {
    setError('');
    if (!phone.trim()) {
      setError('请输入手机号');
      return;
    }
    setSending(true);
    try {
      const dc = await sendCode(phone.trim());
      setDevCode(dc);
      setCooldown(60);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
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
      setError(err?.message || '发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const handleLogin = async () => {
    setError('');
    if (!code.trim()) {
      setError('请输入验证码');
      return;
    }
    setLoggingIn(true);
    try {
      await login(phone.trim(), code.trim());
    } catch (err: any) {
      setError(err?.message || '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Image
          source={require('../../assets/MemoGrad.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text variant="headlineSmall" style={styles.title}>
          考研英语生词本
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          手机号登录，同步学习数据至云端
        </Text>

        <TextInput
          label="手机号"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          mode="outlined"
          style={styles.input}
        />

        <View style={styles.codeRow}>
          <TextInput
            label="验证码"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            mode="outlined"
            style={styles.codeInput}
          />
          <Button
            mode={cooldown > 0 ? 'outlined' : 'contained'}
            onPress={handleSendCode}
            loading={sending}
            disabled={sending || cooldown > 0}
            style={styles.sendBtn}
            labelStyle={styles.sendBtnLabel}
          >
            {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
          </Button>
        </View>

        {devCode && cooldown > 0 && (
          <Animated.View style={[styles.devCodeBar, { opacity: fadeAnim }]}>
            <Text variant="labelMedium" style={styles.devCodeText}>
              验证码：{devCode}（开发模式）
            </Text>
          </Animated.View>
        )}

        {error ? (
          <Text variant="bodySmall" style={styles.errorText}>
            {error}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={handleLogin}
          loading={loggingIn}
          disabled={loggingIn || !code.trim()}
          style={styles.loginBtn}
        >
          登录
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    color: palette.onSurface,
    marginBottom: 4,
  },
  subtitle: {
    color: palette.onSurfaceVariant,
    marginBottom: 28,
  },
  input: {
    width: '100%',
    marginBottom: 16,
  },
  codeRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  codeInput: {
    flex: 1,
  },
  sendBtn: {
    marginTop: 4,
    height: 56,
  },
  sendBtnLabel: {
    fontSize: 13,
  },
  devCodeBar: {
    width: '100%',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  devCodeText: {
    textAlign: 'center',
    color: '#2E7D32',
  },
  errorText: {
    color: palette.error,
    marginTop: 12,
  },
  loginBtn: {
    width: '100%',
    marginTop: 20,
  },
});
