/**
 * 日期工具。
 *
 * 之前 startOfMonth 是 subscriptionService 的私有函数（line 28-31）。Phase A 抽到
 * 这里给 auditLog / stats 复用，并加几个常用的边界处理。
 */

/**
 * 本月起点（UTC）。配额按自然月重置，与订阅周期解耦，用户更好理解。
 *
 * 用 UTC 边界：本机时区不一致会让两个用户在月初看到的配额重置时刻差几小时，
 * 触发"明明没到 1 号却清零了"的客诉。UTC 是单一来源。
 */
export function startOfMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** N 天前的 Date。`days=7` → 7*24h 之前。给 "过去 30 天" 类的查询用。 */
export function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** 把 Date 序列化成 YYYY-MM-DD（UTC）。给"日维度时序"统计用。 */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
