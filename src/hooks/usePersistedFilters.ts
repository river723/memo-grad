// src/hooks/usePersistedFilters.ts
//
// 通用的「筛选/排序状态 + AsyncStorage 持久化」hook。
// 用一个 namespace 作为存储键，跨会话记住用户的排序与筛选选择。
// setFilters 接受部分更新（Partial），内部与既有状态浅合并。

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@memo_grad/filters/';

/**
 * @param namespace 唯一命名空间（如 'DictionaryBrowse'），决定存储键。
 * @param initial   初始筛选状态；也用于类型推断。
 * @returns [filters, setFilters]，setFilters 接受 Partial 部分更新。
 */
export function usePersistedFilters<T extends object>(
  namespace: string,
  initial: T
): [T, (patch: Partial<T>) => void] {
  const [filters, setFilters] = useState<T>(initial);
  const storageKey = KEY_PREFIX + namespace;
  const hydrated = useRef(false);

  // 首次挂载时从存储恢复（异步），恢复完成前保持 initial
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          const saved = JSON.parse(raw) as Partial<T>;
          setFilters((prev) => ({ ...prev, ...saved }));
        } catch {
          // 损坏数据忽略，沿用默认
        }
      })
      .finally(() => {
        hydrated.current = true;
      });
    return () => {
      alive = false;
    };
  }, [storageKey]);

  // 每次变更写回存储（恢复完成后才写，避免用默认值覆盖已存内容）
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(filters)).catch(() => {
      // 写入失败不阻塞 UI
    });
  }, [filters, storageKey]);

  const update = useCallback((patch: Partial<T>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  return [filters, update];
}
