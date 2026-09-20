/**
 * 真题错题（RealExamWrongQuestion）的主键与存储形状。
 *
 * 这个实体的形状与其他同步实体不一致，单独集中定义，避免 SyncService 与
 * migrations 各自维护一份映射后悄悄分叉。
 *
 * 主键：服务端是 @@id([userId, questionId]) 复合主键，模型里**没有 id 列**
 * （业务键就是真题题号）。所以同步不能按 id 匹配，必须按 questionId。
 *
 * 本地存储是混合命名：内容身份字段用 camelCase（与 src/types 的接口声明一致，
 * 各界面直接读 wq.questionId / wq.paperId），而同步元数据与计数用 snake_case
 * （updated_at / wrong_count / last_attempt_at / created_at，沿用全库约定）。
 *
 * 服务端 syncRoutes.toSnakeCase 会把 Prisma 的 camelCase 记录全量转成 snake_case
 * 返回，因此**拉取方向**必须按下面的映射转回本地形状——否则行落进本地后界面读不到
 * 字段（wq.questionId 恒为 undefined），且下次 upsert 匹配不上会继续追加重复行。
 *
 * **推送方向不需要转**：服务端 pickForPrisma 会把 snake→camel 转回 Prisma 字段名，
 * camelCase 输入原样通过，两个方向都能正确落到同一列。
 */

/** 拉取时需要的 snake_case → 本地 camelCase 映射。仅列出两端命名不一致的字段。 */
export const REAL_EXAM_WRONG_PULL_RENAME: Record<string, string> = {
  question_id: 'questionId',
  paper_id: 'paperId',
  set_id: 'setId',
  paper_title: 'paperTitle',
  blank_index: 'blankIndex',
  correct_answer: 'correctAnswer',
  user_answer: 'userAnswer',
};

/** 本地/远端记录匹配键。缺 questionId 时返回 undefined，调用方按"新记录"处理。 */
export function realExamWrongMergeKey(e: any): string | undefined {
  return e?.questionId;
}

/** 把服务端返回的真题错题行转回本地混合形状；无 snake 键时原样返回同一引用。 */
export function normalizeRealExamWrongPull(e: any): any {
  let changed = false;
  const out: Record<string, any> = { ...e };
  for (const [snake, camel] of Object.entries(REAL_EXAM_WRONG_PULL_RENAME)) {
    if (snake in out) {
      out[camel] = out[snake];
      delete out[snake];
      changed = true;
    }
  }
  return changed ? out : e;
}
