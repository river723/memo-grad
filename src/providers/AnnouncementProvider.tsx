/**
 * 公告拉取 Provider。
 *
 * - App 启动 + 每次 HomeScreen focus 时轮询 GET /api/announcements/active
 * - dismiss 状态存 AsyncStorage（按 announcement.id）
 * - 公开端点：未登录也可用；带 token 时会多返回 audience='pro' 的公告
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiClientError } from '../services/ApiClient';
import { useAuth } from './AuthProvider';

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'pro';
  startsAt: string;
  endsAt: string;
}

interface AnnouncementContextValue {
  announcements: ActiveAnnouncement[];
  loading: boolean;
  refresh: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  /** 还没被 dismiss 的可见公告（用于 Banner 渲染） */
  visible: ActiveAnnouncement[];
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null);

const DISMISSED_KEY = '@announcement/dismissed-v1';

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<ActiveAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  // 启动时加载 dismiss 集合
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) setDismissed(new Set(arr));
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ announcements: ActiveAnnouncement[] }>('/api/announcements/active');
      setAnnouncements(r.announcements || []);
    } catch (e) {
      if (e instanceof ApiClientError) {
        // 401/403/网络：忽略，下次 focus 再试
      }
      // 其他错误也静默 —— 公告不应阻断主流程
    } finally {
      setLoading(false);
    }
  }, []);

  // 启动 + 用户变化时拉一次
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      refresh();
    }
  }, [refresh, user?.id]);

  const dismiss = useCallback(async (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const visible = announcements.filter((a) => !dismissed.has(a.id));

  return (
    <AnnouncementContext.Provider value={{ announcements, loading, refresh, dismiss, visible }}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncements() {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) {
    // 没 Provider 时降级为不渲染（不影响主功能）
    return {
      announcements: [], loading: false,
      refresh: async () => {}, dismiss: async () => {}, visible: [],
    } as AnnouncementContextValue;
  }
  return ctx;
}
