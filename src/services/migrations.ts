/**
 * 一次性数据迁移：数字自增 ID → 字符串 UUID。
 *
 * 背景见 [idUtils.ts]。这个迁移是**不可逆**的，因此：
 * - 迁移前把原始数据整体快照到 `kaoyan_migration_backup_v1`，出问题可人工回滚。
 * - 用 `kaoyan_schema_version` 作幂等哨兵，重复调用直接返回。
 * - 外键必须与主键在同一次遍历里用同一张映射表改写，否则 StudyRecord.word_id
 *   会指向一个已经不存在的数字 ID，学习历史和统计会静默丢失。
 *
 * 需要改写的外键关系：
 *   Word.id            → StudyRecord.word_id
 *                      → StudyPlan.word_id
 *                      → Article.word_ids[]
 *                      → DefinitionQuestion.word_id / ClozeQuestion.word_id
 *                        （嵌在 ExamSession.questions[]、ExamSession.answers[].question、
 *                         WrongQuestion.question 里，是最容易漏的一处）
 */

import { generateId, nowIso } from '../utils/idUtils';

export const CURRENT_SCHEMA_VERSION = 2;

/** 数据迁移专用的 key 前缀（无用户前缀，供首次安装/离线场景使用）。 */
const NO_PREFIX = '';

interface MinimalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface MigrationResult {
  migrated: boolean;
  reason?: string;
  counts?: Record<string, number>;
}

/**
 * 执行迁移。幂等：已是最新 schema 版本时直接返回 `migrated: false`。
 *
 * @param storage  底层存储（AsyncStorage 实例）
 * @param prefixFn 将原始 key 名称转成实际存储 key 的函数（可带用户 ID 前缀）
 */
export async function migrateToUuidSchema(
  storage: MinimalStorage,
  prefixFn: (rawKey: string) => string
): Promise<MigrationResult> {
  const k = (rawKey: string) => prefixFn(rawKey);

  // ---- 幂等哨兵 ----
  const versionRaw = await storage.getItem(k('kaoyan_schema_version'));
  const version = versionRaw ? Number(versionRaw) : 1;
  if (version >= CURRENT_SCHEMA_VERSION) {
    return { migrated: false, reason: 'already-current' };
  }

  const [words, records, plans, articles, examSessions, wrongQuestions, realExamSessions, realExamWrongs] =
    await Promise.all([
      readArray(storage, k('kaoyan_words')),
      readArray(storage, k('kaoyan_study_records')),
      readArray(storage, k('kaoyan_study_plans')),
      readArray(storage, k('kaoyan_articles')),
      readArray(storage, k('kaoyan_exam_sessions')),
      readArray(storage, k('kaoyan_wrong_questions')),
      readArray(storage, k('kaoyan_real_exam_sessions')),
      readArray(storage, k('kaoyan_real_exam_wrong_questions')),
    ]);

  // 全新安装：无任何数据，只需打版本号，不做备份（备份空数据没意义）
  const isEmpty =
    words.length === 0 && records.length === 0 && plans.length === 0 && articles.length === 0 &&
    examSessions.length === 0 && wrongQuestions.length === 0 && realExamSessions.length === 0 &&
    realExamWrongs.length === 0;
  if (isEmpty) {
    await storage.setItem(k('kaoyan_schema_version'), String(CURRENT_SCHEMA_VERSION));
    return { migrated: false, reason: 'empty-install' };
  }

  // 已是 UUID 形态但版本号没打上（比如中途崩溃后重进）：补版本号即可
  if (looksMigrated(words) && looksMigrated(records)) {
    await storage.setItem(k('kaoyan_schema_version'), String(CURRENT_SCHEMA_VERSION));
    return { migrated: false, reason: 'already-uuid-shaped' };
  }

  // ---- 备份原始数据，迁移不可逆 ----
  await storage.setItem(
    k('kaoyan_migration_backup_v1'),
    JSON.stringify({
      backedUpAt: nowIso(),
      fromVersion: version,
      words, records, plans, articles,
      examSessions, wrongQuestions, realExamSessions, realExamWrongs,
    })
  );

  const now = nowIso();

  // ---- 第一步：建立 Word 旧 ID → 新 UUID 的映射 ----
  // 必须先建完整张表，再改写所有外键；边遍历边改写会漏掉引用了后面单词的记录。
  const wordIdMap = new Map<string, string>();
  const migratedWords = words.map((w) => {
    const oldKey = keyOf(w?.id);
    const newId = generateId();
    if (oldKey !== null) wordIdMap.set(oldKey, newId);
    return {
      ...w,
      id: newId,
      created_at: w?.created_at ?? now,
      updated_at: w?.updated_at ?? now,
      deleted_at: null,
      // 标 dirty：这些数据从未上过云，登录后需整体推送（"本地数据认领"）
      dirty: true,
    };
  });

  /** 查映射；查不到返回 null，调用方决定是丢弃记录还是留空引用。 */
  const mapWordId = (oldId: unknown): string | null => {
    const k = keyOf(oldId);
    if (k === null) return null;
    return wordIdMap.get(k) ?? null;
  };

  /** 改写嵌套在题目对象里的 word_id。题目可能在多处被引用，统一走这里。 */
  const migrateQuestion = (q: any): any => {
    if (!q || typeof q !== 'object') return q;
    const mapped = mapWordId(q.word_id);
    // 映射不到时置空串而非删字段：保留题面可复习，只是失去回跳单词的能力
    return { ...q, word_id: mapped ?? '' };
  };

  // ---- 第二步：改写各实体的主键与外键 ----

  // StudyRecord：word_id 指向不存在的单词时丢弃该记录。
  // 保留会让统计里出现无法归属的学习次数，比丢弃更糟。
  let droppedRecords = 0;
  const migratedRecords = records.reduce<any[]>((acc, r) => {
    const wordId = mapWordId(r?.word_id);
    if (wordId === null) {
      droppedRecords += 1;
      return acc;
    }
    acc.push({ ...r, id: generateId(), word_id: wordId, updated_at: r?.updated_at ?? now, deleted_at: null, dirty: true });
    return acc;
  }, []);

  // StudyPlan：word_id 为 0 是历史上"新词占位，ID 待定"的哨兵，现在用空串表达。
  // 这类计划要保留（它代表"今天该学 N 个新词"的配额），不能当孤儿丢掉。
  let droppedPlans = 0;
  const migratedPlans = plans.reduce<any[]>((acc, p) => {
    const rawKey = keyOf(p?.word_id);
    const isPlaceholder = rawKey === null || rawKey === '0';
    if (isPlaceholder) {
      acc.push({ ...p, id: generateId(), word_id: '', updated_at: p?.updated_at ?? now, deleted_at: null, dirty: true });
      return acc;
    }
    const wordId = mapWordId(p.word_id);
    if (wordId === null) {
      droppedPlans += 1;
      return acc;
    }
    acc.push({ ...p, id: generateId(), word_id: wordId, updated_at: p?.updated_at ?? now, deleted_at: null, dirty: true });
    return acc;
  }, []);

  // Article：word_ids 是数组，逐个映射并剔除失效项（文章正文仍完整可读）
  const migratedArticles = articles.map((a) => {
    const ids: string[] = Array.isArray(a?.word_ids)
      ? a.word_ids.map(mapWordId).filter((x: string | null): x is string => x !== null)
      : [];
    return {
      ...a,
      id: generateId(),
      word_ids: ids,
      created_at: a?.created_at ?? now,
      updated_at: a?.updated_at ?? now,
      deleted_at: null,
      dirty: true,
    };
  });

  // ExamSession：questions[] 与 answers[].question 里各自嵌着 word_id
  const migratedExamSessions = examSessions.map((s) => ({
    ...s,
    id: generateId(),
    questions: Array.isArray(s?.questions) ? s.questions.map(migrateQuestion) : [],
    answers: Array.isArray(s?.answers)
      ? s.answers.map((ans: any) => ({ ...ans, question: migrateQuestion(ans?.question) }))
      : [],
    created_at: s?.created_at ?? now,
    updated_at: s?.updated_at ?? now,
    deleted_at: null,
    dirty: true,
  }));

  // WrongQuestion：单个 question 嵌 word_id
  const migratedWrongQuestions = wrongQuestions.map((q) => ({
    ...q,
    id: generateId(),
    question: migrateQuestion(q?.question),
    created_at: q?.created_at ?? now,
    updated_at: q?.updated_at ?? now,
    deleted_at: null,
    dirty: true,
  }));

  // RealExamSession：原先用时间戳作 id，无外键指向 Word，只换主键
  const migratedRealExamSessions = realExamSessions.map((s) => ({
    ...s,
    id: generateId(),
    updated_at: s?.updated_at ?? now,
    deleted_at: null,
    dirty: true,
  }));

  // RealExamWrongQuestion：主键是 questionId（真题内容 ID，本就是字符串），不动，只补同步元数据
  const migratedRealExamWrongs = realExamWrongs.map((w) => ({
    ...w,
    updated_at: w?.updated_at ?? now,
    deleted_at: null,
    dirty: true,
  }));

  // ---- 第三步：整体回写 ----
  // 逐键 setItem 没有事务保证；万一中途失败，备份键 + 版本号未推进能保证下次重跑。
  await Promise.all([
    storage.setItem(k('kaoyan_words'), JSON.stringify(migratedWords)),
    storage.setItem(k('kaoyan_study_records'), JSON.stringify(migratedRecords)),
    storage.setItem(k('kaoyan_study_plans'), JSON.stringify(migratedPlans)),
    storage.setItem(k('kaoyan_articles'), JSON.stringify(migratedArticles)),
    storage.setItem(k('kaoyan_exam_sessions'), JSON.stringify(migratedExamSessions)),
    storage.setItem(k('kaoyan_wrong_questions'), JSON.stringify(migratedWrongQuestions)),
    storage.setItem(k('kaoyan_real_exam_sessions'), JSON.stringify(migratedRealExamSessions)),
    storage.setItem(k('kaoyan_real_exam_wrong_questions'), JSON.stringify(migratedRealExamWrongs)),
  ]);

  // 版本号最后写：前面任何一步抛异常都不会留下"已迁移"的假象
  await storage.setItem(k('kaoyan_schema_version'), String(CURRENT_SCHEMA_VERSION));

  const counts = {
    words: migratedWords.length,
    studyRecords: migratedRecords.length,
    studyPlans: migratedPlans.length,
    articles: migratedArticles.length,
    examSessions: migratedExamSessions.length,
    wrongQuestions: migratedWrongQuestions.length,
    realExamSessions: migratedRealExamSessions.length,
    realExamWrongQuestions: migratedRealExamWrongs.length,
    droppedOrphanRecords: droppedRecords,
    droppedOrphanPlans: droppedPlans,
  };
  console.log('[migration] UUID 迁移完成', counts);

  return { migrated: true, counts };
}

/** 安全解析 JSON 数组，任何异常都退化为空数组，避免迁移因单个坏键中断。 */
async function readArray(storage: MinimalStorage, key: string): Promise<any[]> {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`[migration] 解析 ${key} 失败，按空数组处理`);
    return [];
  }
}

/**
 * 把旧的数字 ID 规整为映射表的查找键。
 * 历史数据里同一个 ID 可能以 number 或 string 出现（JSON 往返、导入导出），
 * 统一转成 string 作 key，避免 1 与 "1" 被当成两个不同的词。
 */
function keyOf(id: unknown): string | null {
  if (id === null || id === undefined) return null;
  if (typeof id === 'number') return Number.isFinite(id) ? String(id) : null;
  if (typeof id === 'string') return id.length > 0 ? id : null;
  return null;
}

/** 判断一批记录是否已经是 UUID 形态（迁移过或全新安装）。 */
function looksMigrated(list: any[]): boolean {
  return list.length > 0 && list.every((item) => typeof item?.id === 'string' && item.id.includes('-'));
}
