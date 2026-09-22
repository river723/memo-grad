/**
 * 学习统计纯函数 —— 无 RN / AsyncStorage 依赖。
 *
 * 「今日完成」的口径取 StudyRecord 而不是 StudyPlan，原因见 HomeScreen 注释：
 * StudyRecord 每行独立 UUID、不同端生成的 UUID 必然不同，服务端只走 create
 * 分支，是真正的 append-only，不受 LWW 覆盖与跨设备重复物化影响；
 * StudyPlan.completed 虽是单调布尔，却被当普通字段做 last-write-wins，
 * 会丢失更新、两端必然分歧。
 */

/** 统计所需的最小学习记录结构（StudyRecord structurally satisfies）。 */
export interface PassedRecordLike {
  word_id?: string;
  result?: number;
}

/**
 * 「至少答对过一次」的不同单词数：按 word_id 去重，排除空串 word_id。
 *
 * 空串是「新词占位，ID 待定」的历史哨兵（StudyRecord.word_id 无外键约束），
 * 计入会凭空多出一个"词"。重试救回的场景（result=0 后接 result=1）只算一次。
 */
export function countPassedWords(records: PassedRecordLike[]): number {
  const ids = new Set<string>();
  for (const r of records) {
    if (r?.result === 1 && typeof r.word_id === 'string' && r.word_id.length > 0) {
      ids.add(r.word_id);
    }
  }
  return ids.size;
}
