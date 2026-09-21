/**
 * 一次性数据迁移（按版本分步执行）。
 *
 * 历史：
 * - v1 → v2：数字自增 ID → 字符串 UUID（见 [runUuidV1ToV2]）。不可逆，迁移前整体快照备份。
 * - v2 → v3：间隔重复调度上线。在 Word 上回填 review_stage / next_due_date，并把旧版
 *   "每次学完整套重铺 6 天复习计划" 造成的膨胀/重复未完成计划全部软删（见 [runScheduleV2ToV3]）。
 * - v3 → v4：真题错题本地收敛。按 questionId 去重并把服务端拉回来的 snake_case 行
 *   规整回本地 camelCase 形状（见 [runDedupRealExamWrongsV3ToV4]）。
 * - v4 → v5：学习记录/计划保留窗口裁剪。StudyRecord 每答一次追加一行，是全库增长
 *   最快的表；不裁会一直涨到打满 localStorage 配额，setItem 抛 QuotaExceededError、
 *   作答静默丢失（见 [runRetentionPruneV4ToV5]）。
 *
 * 外键关系（v1→v2 时需随主键一起改写，否则学习历史会静默丢失）：
 *   Word.id → StudyRecord.word_id / StudyPlan.word_id / Article.word_ids[]
 *           → DefinitionQuestion.word_id / ClozeQuestion.word_id
 *             （嵌在 ExamSession.questions[]、ExamSession.answers[].question、WrongQuestion.question 里）
 */

import { generateId, nowIso } from '../utils/idUtils';
import { deriveStageFromRecords } from './scheduler';
import { normalizeRealExamWrongPull } from './realExamWrongShape';
import { STUDY_RECORD_RETENTION_DAYS, STUDY_PLAN_RETENTION_DAYS, retentionCutoff, pruneOlderThan } from '../constants/retention';

export const CURRENT_SCHEMA_VERSION = 5;

/** 各实体的原始存储 key（迁移用无前缀名，经 prefixFn 拼上用户前缀）。 */
const RAW_KEYS = {
  words: 'kaoyan_words',
  records: 'kaoyan_study_records',
  plans: 'kaoyan_study_plans',
  articles: 'kaoyan_articles',
  examSessions: 'kaoyan_exam_sessions',
  wrongQuestions: 'kaoyan_wrong_questions',
  realExamSessions: 'kaoyan_real_exam_sessions',
  realExamWrongs: 'kaoyan_real_exam_wrong_questions',
} as const;

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
 * 迁移入口（幂等）。按哨兵版本号依次执行缺失的步骤；已是最新则直接返回。
 *
 * @param storage  底层存储（AsyncStorage 实例）
 * @param prefixFn 将原始 key 名转成实际存储 key 的函数（可带用户 ID 前缀）
 */
export async function migrateToUuidSchema(
  storage: MinimalStorage,
  prefixFn: (rawKey: string) => string = (rawKey) => rawKey
): Promise<MigrationResult> {
  const k = (rawKey: string) => prefixFn(rawKey);
  const versionKey = k('kaoyan_schema_version');

  const versionRaw = await storage.getItem(versionKey);
  const version = versionRaw ? Number(versionRaw) : 1;
  if (version >= CURRENT_SCHEMA_VERSION) {
    return { migrated: false, reason: 'already-current' };
  }

  const counts: Record<string, number> = {};
  let migrated = false;

  // ---- v1 → v2：数字 ID → UUID ----
  if (version < 2) {
    const r = await runUuidV1ToV2(storage, prefixFn);
    if (r.migrated) {
      migrated = true;
      Object.assign(counts, r.counts ?? {});
    }
  }

  // ---- v2 → v3：阶段化复习调度回填 + 清理膨胀计划 ----
  const v2Raw = await storage.getItem(versionKey);
  const v2 = v2Raw ? Number(v2Raw) : 2;
  if (v2 < 3) {
    const r3 = await runScheduleV2ToV3(storage, k);
    if (r3.migrated) {
      migrated = true;
      counts.wordsBackfilled = r3.wordsBackfilled;
      counts.plansSoftDeleted = r3.plansSoftDeleted;
    }
  }

  // ---- v3 → v4：真题错题按 questionId 收敛 + 拉取行形状规整 ----
  const v3Raw = await storage.getItem(versionKey);
  const v3 = v3Raw ? Number(v3Raw) : 3;
  if (v3 < 4) {
    const r4 = await runDedupRealExamWrongsV3ToV4(storage, k);
    if (r4.migrated) {
      migrated = true;
      counts.realExamWrongsRows = r4.counts.rows;
      counts.realExamWrongsDeduped = r4.counts.deduped;
      counts.realExamWrongsNormalized = r4.counts.normalized;
    }
  }

  // ---- v4 → v5：学习记录/计划保留窗口裁剪 ----
  const v4Raw = await storage.getItem(versionKey);
  const v4 = v4Raw ? Number(v4Raw) : 4;
  if (v4 < 5) {
    const r5 = await runRetentionPruneV4ToV5(storage, k);
    if (r5.migrated) {
      migrated = true;
      counts.studyRecordsDropped = r5.studyRecordsDropped;
      counts.studyPlansDropped = r5.studyPlansDropped;
    }
  }

  return migrated
    ? { migrated: true, counts }
    : { migrated: false, reason: 'up-to-date' };
}

/**
 * v2 → v3：复习调度状态回填 + 膨胀计划清理。
 * - words：按历史答对记录推断 review_stage / next_due_date（见 scheduler.deriveStageFromRecords），
 *   统一写齐并置 dirty 上云；无通过记录 → stage 0 / 未排期。
 * - plans：所有未完成计划（含每天膨胀的 review、空 word_id 占位）软删（deleted_at+dirty，随同步收敛）；
 *   completed 历史全部保留（周趋势依赖）。当天队列由学习页 ensureDailyPlans 据 stage/due 重建。
 * 幂等：动手前快照到 kaoyan_migration_backup_v2，逐键回写后最后才把版本号写 3。
 */
async function runScheduleV2ToV3(
  storage: MinimalStorage,
  k: (rawKey: string) => string
): Promise<{ migrated: boolean; wordsBackfilled: number; plansSoftDeleted: number }> {
  const [words, records, plans] = await Promise.all([
    readArray(storage, k(RAW_KEYS.words)),
    readArray(storage, k(RAW_KEYS.records)),
    readArray(storage, k(RAW_KEYS.plans)),
  ]);

  const isEmpty = words.length === 0 && records.length === 0 && plans.length === 0;
  if (isEmpty) {
    await storage.setItem(k('kaoyan_schema_version'), '3');
    return { migrated: false, wordsBackfilled: 0, plansSoftDeleted: 0 };
  }

  await storage.setItem(
    k('kaoyan_migration_backup_v2'),
    JSON.stringify({ backedUpAt: nowIso(), fromVersion: 2, words, records, plans })
  );

  const now = nowIso();

  // 按 word 聚合学习记录，回填调度状态
  const recordsByWord = new Map<string, any[]>();
  for (const r of records) {
    if (!r || typeof r.word_id !== 'string' || r.word_id.length === 0) continue;
    const list = recordsByWord.get(r.word_id);
    if (list) list.push(r);
    else recordsByWord.set(r.word_id, [r]);
  }

  let wordsBackfilled = 0;
  const nextWords = words.map((w: any) => {
    const { stage, nextDue } = deriveStageFromRecords(recordsByWord.get(w?.id) ?? []);
    const hasStage = typeof w?.review_stage === 'number';
    if (!hasStage || w.review_stage !== stage || w.next_due_date !== nextDue) {
      wordsBackfilled += 1;
    }
    return {
      ...w,
      review_stage: stage,
      next_due_date: nextDue,
      updated_at: now,
      dirty: true,
    };
  });

  // 软删所有未完成计划；completed / 已软删的原样保留
  let plansSoftDeleted = 0;
  const nextPlans = plans.map((p: any) => {
    if (!p || p.completed || p.deleted_at) return p;
    plansSoftDeleted += 1;
    return { ...p, deleted_at: now, updated_at: now, dirty: true };
  });

  await Promise.all([
    storage.setItem(k(RAW_KEYS.words), JSON.stringify(nextWords)),
    storage.setItem(k(RAW_KEYS.plans), JSON.stringify(nextPlans)),
  ]);

  // 版本号最后写：任一步抛异常都不会留下"已迁移"的假象
  await storage.setItem(k('kaoyan_schema_version'), '3');

  const result = { wordsBackfilled, plansSoftDeleted };
  console.log('[migration] v3 复习调度回填完成', result);
  return { migrated: true, ...result };
}

// ---------------------------------------------------------------------------
// v1 → v2：数字自增 ID → 字符串 UUID
// ---------------------------------------------------------------------------

/**
 * 执行 v1→v2 迁移。仅在哨兵版本 < 2 时由入口调用。成功后把版本号写 2（交给入口继续 v3）。
 */
async function runUuidV1ToV2(
  storage: MinimalStorage,
  prefixFn: (rawKey: string) => string = (rawKey) => rawKey
): Promise<MigrationResult> {
  const k = (rawKey: string) => prefixFn(rawKey);

  // ---- 幂等哨兵（缺省视为 v1）----
  const versionRaw = await storage.getItem(k('kaoyan_schema_version'));
  const version = versionRaw ? Number(versionRaw) : 1;

  const [words, records, plans, articles, examSessions, wrongQuestions, realExamSessions, realExamWrongs] =
    await Promise.all([
      readArray(storage, k(RAW_KEYS.words)),
      readArray(storage, k(RAW_KEYS.records)),
      readArray(storage, k(RAW_KEYS.plans)),
      readArray(storage, k(RAW_KEYS.articles)),
      readArray(storage, k(RAW_KEYS.examSessions)),
      readArray(storage, k(RAW_KEYS.wrongQuestions)),
      readArray(storage, k(RAW_KEYS.realExamSessions)),
      readArray(storage, k(RAW_KEYS.realExamWrongs)),
    ]);

  // 全新安装：无任何数据，只需打版本号，不做备份（备份空数据没意义）
  const isEmpty =
    words.length === 0 && records.length === 0 && plans.length === 0 && articles.length === 0 &&
    examSessions.length === 0 && wrongQuestions.length === 0 && realExamSessions.length === 0 &&
    realExamWrongs.length === 0;
  if (isEmpty) {
    await storage.setItem(k('kaoyan_schema_version'), '2');
    return { migrated: false, reason: 'empty-install' };
  }

  // 已是 UUID 形态但版本号没打上（比如中途崩溃后重进）：补版本号即可
  if (looksMigrated(words) && looksMigrated(records)) {
    await storage.setItem(k('kaoyan_schema_version'), '2');
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
    storage.setItem(k(RAW_KEYS.words), JSON.stringify(migratedWords)),
    storage.setItem(k(RAW_KEYS.records), JSON.stringify(migratedRecords)),
    storage.setItem(k(RAW_KEYS.plans), JSON.stringify(migratedPlans)),
    storage.setItem(k(RAW_KEYS.articles), JSON.stringify(migratedArticles)),
    storage.setItem(k(RAW_KEYS.examSessions), JSON.stringify(migratedExamSessions)),
    storage.setItem(k(RAW_KEYS.wrongQuestions), JSON.stringify(migratedWrongQuestions)),
    storage.setItem(k(RAW_KEYS.realExamSessions), JSON.stringify(migratedRealExamSessions)),
    storage.setItem(k(RAW_KEYS.realExamWrongs), JSON.stringify(migratedRealExamWrongs)),
  ]);

  // 版本号最后写：前面任何一步抛异常都不会留下"已迁移"的假象
  await storage.setItem(k('kaoyan_schema_version'), '2');

  const counts = {
    word: migratedWords.length,
    studyRecord: migratedRecords.length,
    studyPlan: migratedPlans.length,
    article: migratedArticles.length,
    examSession: migratedExamSessions.length,
    wrongQuestion: migratedWrongQuestions.length,
    realExamSession: migratedRealExamSessions.length,
    realExamWrongQuestion: migratedRealExamWrongs.length,
    droppedOrphanRecords: droppedRecords,
    droppedOrphanPlans: droppedPlans,
  };
  console.log('[migration] UUID 迁移完成', counts);

  return { migrated: true, counts };
}

/**
 * v3 → v4：真题错题本地收敛。
 *
 * 背景：服务端 RealExamWrongQuestion 是 @@id([userId, questionId]) 复合主键、无 id 列，
 * 早期同步拉取按 id 匹配会失败，每条远端行都被当成新行 push 进来；同时服务端返回
 * snake_case、本地内容是 camelCase，拉回来的行键名对不上界面。两步一起做：
 *   - 按 questionId 收敛重复行：保留 updated_at 最新的一条（它承载最近一次用户动作，
 *     无论是删除还是重新做对，软删事实随该行一并保留），其余物理移除
 *   - 把 snake_case 内容身份字段规整回本地 camelCase 形状
 *
 * 物理移除是安全的：被移除行的逻辑记录已由保留行承载，且这些行 dirty=false，
 * 不会因软删回推而在服务端制造幻影删除。
 *
 * 幂等：questionId 收敛后重跑无变化；动手前快照到 kaoyan_migration_backup_v3，
 * 版本号最后写，任一步抛错都不会留下"已迁移"的假象。
 */
async function runDedupRealExamWrongsV3ToV4(
  storage: MinimalStorage,
  k: (rawKey: string) => string
): Promise<{ migrated: boolean; counts: { rows: number; deduped: number; normalized: number } }> {
  const raw = await readArray(storage, k(RAW_KEYS.realExamWrongs));
  // 只认带业务键的行：既可能是本地 camelCase，也可能是拉回来的 snake_case
  const rows = raw.filter(
    (e) => e && (typeof e.questionId === 'string' || typeof e.question_id === 'string')
  );

  if (rows.length === 0) {
    await storage.setItem(k('kaoyan_schema_version'), '4');
    return { migrated: false, counts: { rows: 0, deduped: 0, normalized: 0 } };
  }

  await storage.setItem(
    k('kaoyan_migration_backup_v3'),
    JSON.stringify({ backedUpAt: nowIso(), fromVersion: 3, realExamWrongs: raw })
  );

  // 形状归一化：question_id → questionId 等，让后续分组能对上键
  let normalized = 0;
  const shaped = rows.map((e) => {
    const n = normalizeRealExamWrongPull(e);
    if (n !== e) normalized += 1;
    return n;
  });

  // 按 questionId 保留 updated_at 最新的一条（ISO 串可直接字典序比较）
  const byId = new Map<string, any>();
  for (const e of shaped) {
    const id = e.questionId;
    const prev = byId.get(id);
    if (!prev || (e.updated_at || '') > (prev.updated_at || '')) byId.set(id, e);
  }

  const deduped = shaped.length - byId.size;
  await storage.setItem(k(RAW_KEYS.realExamWrongs), JSON.stringify([...byId.values()]));
  await storage.setItem(k('kaoyan_schema_version'), '4');

  const counts = { rows: shaped.length, deduped, normalized };
  console.log('[migration] 真题错题收敛完成', counts);
  return { migrated: true, counts };
}

/**
 * v4 → v5：学习记录 / 学习计划按保留窗口物理裁剪。
 *
 * StudyRecord 每答一次（含一个词内的重试）追加一行，是全库增长最快的表；
 * StudyPlan 每天每词一行、完成后也不清理。两者本地走整表 read-modify-write，
 * 不裁会一直涨到打满 localStorage 配额——setItem 抛 QuotaExceededError，
 * StudyScreen 的作答落库静默失败，用户只看到"已继续学习"。
 *
 * 本步是一次性清理历史积压：下次启动就跑完，不必等用户再答一题。
 * 增量增长由 StorageService.addStudyRecord / writePrunedPlans 在每次写入时兜住。
 *
 * 裁剪是物理移除而非软删除：软删的行仍被序列化进同一个 blob，占用的字节一点
 * 没少。只裁本地、不动服务端：管理后台的学习活跃度统计需要完整历史，且增量
 * 同步只拉 updatedAt > lastSyncAt 的行，裁掉的旧行不会再被拉回来。
 *
 * 幂等：裁完再跑 dropped 为 0、不重写。版本号最后写，任一步抛错都不会留下
 * "已迁移"的假象。写失败（配额已满）由 ensureMigrated 的 catch 吞掉，
 * addStudyRecord 侧的裁剪会在下一次作答时自愈。
 */
async function runRetentionPruneV4ToV5(
  storage: MinimalStorage,
  k: (rawKey: string) => string
): Promise<{ migrated: boolean; studyRecordsDropped: number; studyPlansDropped: number }> {
  const records = await readArray(storage, k(RAW_KEYS.records));
  const recordCutoff = retentionCutoff(STUDY_RECORD_RETENTION_DAYS);
  const prunedRecords = pruneOlderThan(records, 'study_date', recordCutoff);

  const plans = await readArray(storage, k(RAW_KEYS.plans));
  const planCutoff = retentionCutoff(STUDY_PLAN_RETENTION_DAYS);
  const prunedPlans = pruneOlderThan(plans, 'plan_date', planCutoff);

  await Promise.all([
    storage.setItem(k(RAW_KEYS.records), JSON.stringify(prunedRecords.kept)),
    storage.setItem(k(RAW_KEYS.plans), JSON.stringify(prunedPlans.kept)),
  ]);
  await storage.setItem(k('kaoyan_schema_version'), '5');

  const studyRecordsDropped = prunedRecords.dropped;
  const studyPlansDropped = prunedPlans.dropped;
  if (studyRecordsDropped > 0 || studyPlansDropped > 0) {
    console.log(
      '[migration] 保留窗口裁剪完成',
      { studyRecordsDropped, studyPlansDropped, recordCutoff, planCutoff }
    );
  }

  return {
    migrated: studyRecordsDropped > 0 || studyPlansDropped > 0,
    studyRecordsDropped,
    studyPlansDropped,
  };
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
