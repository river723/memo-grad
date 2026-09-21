/**
 * 数据保留窗口（天数）+ 按日期裁剪的纯函数。
 *
 * 独立成文件（不放进会引用 `__DEV__` 的 constants/index.ts），
 * 以便迁移（scripts/test-migration.js 用 tsc 单文件编译）和无 RN 运行时的
 * 纯逻辑都能引用。
 *
 * 背景：StudyRecord / StudyPlan 是只追加的日志表，本地 AsyncStorage 走整表
 * read-modify-write。不设保留窗口就会无限增长，最终把 localStorage 配额打满
 * （setItem 抛 QuotaExceededError，作答落库失败）。软删除救不了——软删的行
 * 仍被序列化进同一个 blob，占用的字节一点没少。所以裁剪必须是物理移除。
 *
 * 窗口按"实际消费方需要多少历史"取值，不是越大越好：
 *   - StudyRecord：周趋势只看最近 7 天；按词正确率（掌握度/难词/AI 选词）
 *     在 90 天内已有很充分的信号。更久的记录对排课无用——排课状态挂在
 *     Word.review_stage / next_due_date 上（见 scheduler.ts），不读历史记录。
 *   - StudyPlan：周趋势 + 当日计划，30 天绰绰有余。
 *
 * 服务端保留全量：管理后台的学习活跃度分析（totalRecords / distinctDays /
 * 正确率）需要完整历史，且 Postgres 不受浏览器配额约束。物理裁剪只发生在
 * 本地；且增量同步只拉 updatedAt > lastSyncAt 的行，已裁掉的旧行不会再回来。
 */
import { subDays, format } from 'date-fns';

export const STUDY_RECORD_RETENTION_DAYS = 90;
export const STUDY_PLAN_RETENTION_DAYS = 30;

/**
 * 配额兜底保留期：正常裁剪后仍写不下（其他 key 也占满了）时的最短窗口。
 * 7 天覆盖周趋势与当日统计——这是各消费方的下限，再短就会影响界面数据。
 */
export const RETENTION_FALLBACK_DAYS = 7;

/** 保留窗口下界：'yyyy-MM-dd' 本地日期，>= 该值即保留。 */
export function retentionCutoff(days: number, from: Date = new Date()): string {
  return format(subDays(from, days), 'yyyy-MM-dd');
}

/**
 * 按日期字段裁剪列表：保留 dateField >= cutoff 的行。
 *
 * 纯函数，不写存储。无法判定日期的行（缺失/空串/非字符串）保守保留——
 * 宁可多占一点空间，也不静默丢数据。'yyyy-MM-dd' 可直接字典序比较。
 */
export function pruneOlderThan<T extends Record<string, any>>(
  rows: T[],
  dateField: string,
  cutoff: string
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let dropped = 0;
  for (const row of rows) {
    const d = row?.[dateField];
    if (typeof d !== 'string' || d.length === 0 || d >= cutoff) {
      kept.push(row);
    } else {
      dropped += 1;
    }
  }
  return { kept, dropped };
}

/** 判断是否为浏览器/localStorage 的配额耗尽错误（web 端 QuotaExceededError）。 */
export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; message?: string };
  if (e.name === 'QuotaExceededError') return true;
  // 兜底：不同平台/RN 适配层的错误名不一致，用消息关键词再判一次
  return typeof e.message === 'string' && /quota|exceeded/i.test(e.message);
}
