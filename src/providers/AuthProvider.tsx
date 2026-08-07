/**
 * 认证上下文：管理登录/登出、token 持久化、订阅与配额状态。
 *
 * 登录流程：
 *   1. 用户输入手机号 → sendCode(phone) → 服务端发短信/回显 devCode
 *   2. 用户输入验证码 → login(phone, code) → 服务端返回 JWT + entitlement
 *   3. token 存入 AsyncStorage，ApiClient 自动注入，后续请求无需手动处理
 *
 * isPro 的判定完全依赖服务端 /me 返回的 entitlement.isPro——
 * 前端没有任何本地判断付费的路径，改 AsyncStorage 不能解锁 AI。
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import StorageService from '../services/StorageService';
import { registerTokenStore, api, ApiClientError } from '../services/ApiClient';

/**
 * 权益信息（对应服务端 /me 返回的 entitlement 字段）。
 * 与 server/src/services/subscriptionService.ts 的类型保持一致。
 */
export interface Entitlement {
  isPro: boolean;
  plan: string | null;
  status: 'active' | 'expired' | 'none';
  expiresAt: string | null;
  quota: {
    monthlyLimit: number;
    used: number;
    remaining: number;
  };
}

/** /me 返回的用户信息 */
export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  role: 'user' | 'admin';
  createdAt: string;
}

interface AuthState {
  /** 是否正在初始化（从 AsyncStorage 恢复 token 中） */
  loading: boolean;
  /** 已登录的用户 */
  user: AuthUser | null;
  /** 当前权益 */
  entitlement: Entitlement | null;
  /** 是否有 AI 使用权 */
  isPro: boolean;
}

interface AuthContextValue extends AuthState {
  /** 发送验证码。返回 devCode（开发模式）或 null（生产模式）。 */
  sendCode: (phone: string) => Promise<string | null>;
  /** 验证码登录。成功后自动写入 AsyncStorage。 */
  login: (phone: string, code: string) => Promise<void>;
  /** 登出。清除本地 token，撤销服务端 refresh token。 */
  logout: () => Promise<void>;
  /** 拉取最新权益（支付成功后调用，避免轮询订单）。 */
  refreshEntitlement: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_KEYS = {
  ACCESS_TOKEN: 'kaoyan_access_token',
  REFRESH_TOKEN: 'kaoyan_refresh_token',
};

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  /** 把 token 同步写入 AsyncStorage 和 ApiClient 内存。 */
  const persistTokens = useCallback(async (accessToken: string | null, refreshToken: string | null) => {
    if (accessToken) {
      await StorageService._rawSetItem(AUTH_KEYS.ACCESS_TOKEN, accessToken);
    } else {
      await StorageService._rawRemove(AUTH_KEYS.ACCESS_TOKEN);
    }
    if (refreshToken) {
      await StorageService._rawSetItem(AUTH_KEYS.REFRESH_TOKEN, refreshToken);
    } else {
      await StorageService._rawRemove(AUTH_KEYS.REFRESH_TOKEN);
    }
  }, []);

  /** 恢复登录态：启动时从 AsyncStorage 拿 token，调 /me 校验有效性。 */
  const restoreSession = useCallback(async () => {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        StorageService._rawGetItem(AUTH_KEYS.ACCESS_TOKEN),
        StorageService._rawGetItem(AUTH_KEYS.REFRESH_TOKEN),
      ]);

      if (!accessToken || !refreshToken) {
        setLoading(false);
        return;
      }

      // 叫 registerTokenStore 时直接用同步的闭包变量（启动时已经读到内存了）
    const initialTokens = { accessToken, refreshToken };
    registerTokenStore(
      () => initialTokens,
        async (at: string | null, rt: string | null) => {
          await persistTokens(at, rt);
        }
      );

      // 先手动设置凭据
      await persistTokens(accessToken, refreshToken);

      // 调 /me 校验 token 有效性，同时拿到最新 user + entitlement
      const result = await api.get<{ user: AuthUser; entitlement: Entitlement }>('/me');
      setUser(result.user);
      setEntitlement(result.entitlement);
    } catch {
      // token 无效 / 网络不通：清除，下次启动重试
      await persistTokens(null, null);
    } finally {
      setLoading(false);
    }
  }, [persistTokens]);

  useEffect(() => { restoreSession(); }, []);

  /**
   * 注册 token getter 给 ApiClient：每次发起请求，ApiClient 从
   * AsyncStorage 实时取最新的 token 值（而非闭包里的旧快照）。
   */
  useEffect(() => { (async () => {
    const [at, rt] = await Promise.all([
      StorageService._rawGetItem(AUTH_KEYS.ACCESS_TOKEN),
      StorageService._rawGetItem(AUTH_KEYS.REFRESH_TOKEN),
    ]);
    const tokens = { accessToken: at, refreshToken: rt };
    registerTokenStore(
      () => tokens,
      async (at: string | null, rt: string | null) => {
        await persistTokens(at, rt);
      }
    );
  })(); }, [persistTokens]);

  const sendCode = useCallback(async (phone: string): Promise<string | null> => {
    const res = await api.post<{ sent: boolean; expiresAt: string; devCode?: string }>(
      '/auth/send-code',
      { phone },
      { noAuth: true }
    );
    return res.devCode ?? null;
  }, []);

  const login = useCallback(async (phone: string, code: string) => {
    const res = await api.post<{
      accessToken: string;
      refreshToken: string;
      isNewUser: boolean;
      user: AuthUser;
      entitlement: Entitlement;
    }>('/auth/login', { phone, code, deviceId: 'web', platform: 'web' }, { noAuth: true });

    await persistTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    setEntitlement(res.entitlement);
  }, [persistTokens]);

  const logout = useCallback(async () => {
    try {
      const rt = await StorageService._rawGetItem(AUTH_KEYS.REFRESH_TOKEN);
      if (rt) {
        await api.post('/auth/logout', { refreshToken: rt }, { noAuth: true });
      }
    } catch {
      // 网络不通也要清除本地：用户要的就是退出
    }
    await persistTokens(null, null);
    setUser(null);
    setEntitlement(null);
  }, [persistTokens]);

  const refreshEntitlement = useCallback(async () => {
    if (!user) return;
    const result = await api.get<{ user: AuthUser; entitlement: Entitlement }>('/me');
    setEntitlement(result.entitlement);
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    user,
    entitlement,
    isPro: entitlement?.isPro ?? false,
    sendCode,
    login,
    logout,
    refreshEntitlement,
  }), [loading, user, entitlement, sendCode, login, logout, refreshEntitlement]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
