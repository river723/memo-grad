/**
 * 同步合并纯函数 —— 无 RN / AsyncStorage 依赖，便于单测。
 */

/**
 * 把远端实体合并进本地列表（纯函数，返回新数组，不修改入参）。
 *
 * 合并规则分两种情况：
 *   - 本地行**不 dirty**：本地没有未推送的修改，服务器就是权威，无条件取远端。
 *     **不再比较 updated_at**——remote 是服务器 `@updatedAt`，local 是设备本地
 *     `nowIso()`，两个时钟基不同。设备时钟偏快于服务器时，这个比较会静默拒绝
 *     合法更新，而 dirty 早已被清成 false、永不重试，于是永久丢更新。
 *     （服务端也踩过同一个坑：syncRoutes 丢弃客户端传入的 updatedAt 改由
 *     `@updatedAt` 维护，这里此前没跟上。）
 *   - 本地行 **dirty**：仍有未推送修改，保留原有时间戳比较，不改合并语义。
 */
export function mergePulledEntities<T extends Record<string, any>>(
  locals: T[],
  remoteList: T[],
  keyOf: (e: Record<string, any>) => string | undefined
): T[] {
  const merged = [...locals];
  const localIdxByKey = new Map<string, number>();
  merged.forEach((e, i) => {
    const key = keyOf(e as Record<string, any>);
    if (key) localIdxByKey.set(key, i);
  });

  for (const remote of remoteList) {
    const idx = localIdxByKey.get(keyOf(remote));
    if (idx === undefined) {
      merged.push({ ...remote, dirty: false });
      continue;
    }
    const local = merged[idx];
    const localIsNewer =
      typeof local.updated_at === 'string' &&
      local.updated_at.length > 0 &&
      new Date(remote.updated_at) < new Date(local.updated_at);
    // 非 dirty 无条件接受；dirty 行只在远端不早于本地时接受
    if (!local.dirty || !localIsNewer) {
      merged[idx] = { ...remote, dirty: false };
    }
  }
  return merged;
}
