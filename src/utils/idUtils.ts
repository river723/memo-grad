/**
 * 实体 ID 生成与同步元数据工具。
 *
 * 网络版改造（阶段 0）：实体 ID 从自增数字迁移为字符串 UUID。
 * 原因是自增 ID 在多设备场景必然冲突——两台设备各新建一条记录都会
 * 拿到同一个 `max(id)+1`，云同步时无法区分。UUID 由客户端生成，
 * 离线也能立即写入，是 local-first 同步的前提。
 *
 * 不依赖 uuid 包：仓库里的 uuid@8 是传递依赖，且在 React Native 下
 * 需要 crypto.getRandomValues 的 polyfill。这里优先用平台原生 crypto，
 * 缺失时回退到 Math.random，对本场景（单用户量级的本地实体）足够。
 */

/** 生成 RFC 4122 v4 格式的 UUID 字符串。 */
export function generateId(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;

  // 首选：原生 randomUUID（RN 0.74+ / 现代浏览器 / Node 19+）
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  // 次选：用密码学随机字节手工拼装 v4
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // 兜底：Math.random。碰撞概率对单用户本地数据可忽略。
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 当前时间的 ISO 串，用于 updated_at / deleted_at。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 判断一条记录是否已被软删除。
 * 软删除而非物理删除，是因为同步需要把"删除"这个事实传播到其他设备——
 * 物理删除后本地无痕迹，拉取远端时该记录会被当作新数据复活。
 */
export function isDeleted(entity: { deleted_at?: string | null }): boolean {
  return Boolean(entity.deleted_at);
}

/** 过滤掉软删除的记录，供各读取方法返回给 UI。 */
export function excludeDeleted<T extends { deleted_at?: string | null }>(list: T[]): T[] {
  return list.filter((item) => !item.deleted_at);
}
