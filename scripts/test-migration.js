/**
 * UUID 迁移的验证脚本（Node 直跑，不依赖 jest/RN 环境）。
 *
 * 迁移是不可逆的，且外键改写一旦有误就是静默数据丢失——学习记录会指向
 * 不存在的单词，统计和复习计划全部错位，用户不会立刻发现。所以这里用
 * 内存 storage 构造真实形状的旧数据，逐条断言外键在迁移后仍然闭合。
 *
 * 运行：node scripts/test-migration.js
 */

const path = require('path');

// ts 源码用 esbuild/ts-node 都要额外装依赖；这里直接把 migrations.ts 的逻辑
// 通过 require 钩子转译过于重，改为用 tsc 预编译到临时目录后 require。
// 为保持脚本零依赖，改为最朴素的做法：内联复制被测逻辑不可取（会与实现漂移），
// 因此这里通过 child_process 调 tsc 输出到 .tmp-migration-test 后加载。
const { execSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.tmp-migration-test');

function compile() {
  fs.rmSync(OUT, { recursive: true, force: true });
  execSync(
    `npx -y -p typescript@5.7.2 tsc src/services/migrations.ts src/utils/idUtils.ts ` +
      `--outDir ${JSON.stringify(OUT)} --module commonjs --target es2019 --skipLibCheck`,
    { cwd: ROOT, stdio: 'inherit' }
  );
}

/** 内存版 storage，形状与 StorageService 内部的 StorageInterface 一致。 */
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => void map.set(k, v),
    read: (k) => JSON.parse(map.get(k) || 'null'),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

async function main() {
  compile();
  const { migrateToUuidSchema, CURRENT_SCHEMA_VERSION } = require(
    path.join(OUT, 'services/migrations.js')
  );

  // ---------- 场景 1：典型旧数据，外键必须全部改写并保持闭合 ----------
  console.log('\n[场景 1] 旧数字 ID 数据迁移 + 外键闭合');
  const storage = makeStorage({
    kaoyan_words: JSON.stringify([
      { id: 1, word: 'abandon', definitions: [], difficulty: 3, frequency: 5 },
      { id: 2, word: 'benefit', definitions: [], difficulty: 2, frequency: 4 },
      { id: 3, word: 'candid', definitions: [], difficulty: 4, frequency: 2 },
    ]),
    kaoyan_study_records: JSON.stringify([
      { id: 1, word_id: 1, study_date: '2026-08-01', result: 1, study_mode: 'flashcard' },
      { id: 2, word_id: 2, study_date: '2026-08-01', result: 0, study_mode: 'quiz' },
      // 孤儿：word_id 99 不存在，应被丢弃
      { id: 3, word_id: 99, study_date: '2026-08-02', result: 1, study_mode: 'flashcard' },
    ]),
    kaoyan_study_plans: JSON.stringify([
      { id: 1, word_id: 1, plan_date: '2026-08-05', plan_type: 'review', completed: false },
      // 占位计划：word_id 0 表示"新词待定"，必须保留为空串
      { id: 2, word_id: 0, plan_date: '2026-08-05', plan_type: 'new', completed: false },
      // 孤儿计划：应被丢弃
      { id: 3, word_id: 77, plan_date: '2026-08-06', plan_type: 'review', completed: false },
    ]),
    kaoyan_articles: JSON.stringify([
      {
        id: 1, title: 'T', content: 'c', translation: 't',
        words: ['abandon', 'benefit'],
        word_ids: [1, 2, 42],          // 42 是失效引用，应被剔除
        theme: 'random', created_at: '2026-08-01T00:00:00.000Z', read_count: 0,
      },
    ]),
    kaoyan_exam_sessions: JSON.stringify([
      {
        id: 1, question_type: 'cloze', accuracy: 0.5, created_at: '2026-08-01T00:00:00.000Z',
        questions: [
          { type: 'cloze', word_id: 1, target_word: 'abandon', sentence: 's', options: [], correct_answer: 'abandon' },
        ],
        answers: [
          {
            question_index: 0,
            question: { type: 'cloze', word_id: 1, target_word: 'abandon', sentence: 's', options: [], correct_answer: 'abandon' },
            selected_answer: 'abandon', is_correct: true,
          },
        ],
      },
    ]),
    kaoyan_wrong_questions: JSON.stringify([
      {
        id: 1,
        question: { type: 'definition', word_id: 2, word: 'benefit', sentence: 's', correct_definition: 'd', options: [] },
        wrong_answer: 'x', correct_count: 0, wrong_count: 1,
        last_attempt_at: '2026-08-01T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z',
      },
    ]),
    kaoyan_real_exam_sessions: JSON.stringify([
      { id: 1754300000000, year: 2023, mode: 'cloze', paperId: '2023-cloze', answers: [], score: 3, total: 20, createdAt: '2026-08-01T00:00:00.000Z' },
    ]),
    kaoyan_real_exam_wrong_questions: JSON.stringify([
      {
        questionId: '2023-cloze-b1', year: 2023, setId: 'english1', mode: 'cloze',
        paperId: '2023-cloze', blankIndex: 1, options: [], correctAnswer: 'A',
        userAnswer: 'B', wrong_count: 1, correct_count: 0,
        last_attempt_at: '2026-08-01T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z',
      },
    ]),
  });

  const result = await migrateToUuidSchema(storage);
  check('返回 migrated=true', result.migrated === true, JSON.stringify(result));

  const words = storage.read('kaoyan_words');
  const records = storage.read('kaoyan_study_records');
  const plans = storage.read('kaoyan_study_plans');
  const articles = storage.read('kaoyan_articles');
  const sessions = storage.read('kaoyan_exam_sessions');
  const wrongs = storage.read('kaoyan_wrong_questions');
  const realSessions = storage.read('kaoyan_real_exam_sessions');
  const realWrongs = storage.read('kaoyan_real_exam_wrong_questions');

  check('所有 Word.id 是合法 UUID', words.every((w) => UUID_RE.test(w.id)));
  check('Word 数量不变 (3)', words.length === 3, `实际 ${words.length}`);
  check('Word 保留原字段 (word 文本)', words.map((w) => w.word).join(',') === 'abandon,benefit,candid');
  check('Word 带 dirty 标记（待推送云端）', words.every((w) => w.dirty === true));
  check('Word 带 deleted_at=null', words.every((w) => w.deleted_at === null));
  check('Word 带 updated_at', words.every((w) => typeof w.updated_at === 'string'));

  const idOf = (text) => words.find((w) => w.word === text).id;
  const validWordIds = new Set(words.map((w) => w.id));

  // 核心断言：外键闭合
  check('孤儿 StudyRecord 被丢弃 (3→2)', records.length === 2, `实际 ${records.length}`);
  check(
    'StudyRecord.word_id 全部指向存在的 Word',
    records.every((r) => validWordIds.has(r.word_id)),
    JSON.stringify(records.map((r) => r.word_id))
  );
  check('StudyRecord 外键映射正确（abandon 的记录仍是 result=1）',
    records.find((r) => r.word_id === idOf('abandon')).result === 1);
  check('StudyRecord 外键映射正确（benefit 的记录仍是 result=0）',
    records.find((r) => r.word_id === idOf('benefit')).result === 0);
  check('StudyRecord.id 换成 UUID', records.every((r) => UUID_RE.test(r.id)));

  check('占位计划保留 + 孤儿计划丢弃 (3→2)', plans.length === 2, `实际 ${plans.length}`);
  const placeholder = plans.find((p) => p.plan_type === 'new');
  check('占位计划 word_id 变成空串（原为 0）', placeholder && placeholder.word_id === '',
    JSON.stringify(placeholder));
  const reviewPlan = plans.find((p) => p.plan_type === 'review');
  check('复习计划 word_id 正确指向 abandon', reviewPlan && reviewPlan.word_id === idOf('abandon'));

  check('Article.word_ids 剔除失效引用 (3→2)', articles[0].word_ids.length === 2,
    JSON.stringify(articles[0].word_ids));
  check('Article.word_ids 全部有效', articles[0].word_ids.every((id) => validWordIds.has(id)));
  check('Article.word_ids 指向 abandon 与 benefit',
    articles[0].word_ids.includes(idOf('abandon')) && articles[0].word_ids.includes(idOf('benefit')));
  check('Article.id 换成 UUID', UUID_RE.test(articles[0].id));

  // 嵌套 word_id —— 最易漏的一处
  check('ExamSession.questions[].word_id 已改写',
    sessions[0].questions[0].word_id === idOf('abandon'),
    sessions[0].questions[0].word_id);
  check('ExamSession.answers[].question.word_id 已改写',
    sessions[0].answers[0].question.word_id === idOf('abandon'),
    sessions[0].answers[0].question.word_id);
  check('WrongQuestion.question.word_id 已改写',
    wrongs[0].question.word_id === idOf('benefit'), wrongs[0].question.word_id);

  check('RealExamSession.id 由时间戳换成 UUID', UUID_RE.test(realSessions[0].id));
  check('RealExamSession 业务字段不变', realSessions[0].year === 2023 && realSessions[0].score === 3);
  check('RealExamWrongQuestion.questionId 保持不变（真题内容 ID）',
    realWrongs[0].questionId === '2023-cloze-b1');
  check('RealExamWrongQuestion 补上同步元数据', realWrongs[0].dirty === true && realWrongs[0].deleted_at === null);

  check('schema 版本已推进', storage.map.get('kaoyan_schema_version') === String(CURRENT_SCHEMA_VERSION));
  check('原始数据已备份', Boolean(storage.map.get('kaoyan_migration_backup_v1')));
  const backup = JSON.parse(storage.map.get('kaoyan_migration_backup_v1'));
  check('备份含迁移前的数字 ID', backup.words[0].id === 1);

  // ---------- 场景 2：幂等性 ----------
  console.log('\n[场景 2] 幂等性——重复迁移不得改动数据');
  const before = storage.map.get('kaoyan_words');
  const second = await migrateToUuidSchema(storage);
  check('第二次返回 migrated=false', second.migrated === false, JSON.stringify(second));
  check('reason=already-current', second.reason === 'already-current');
  check('数据未被二次改写', storage.map.get('kaoyan_words') === before);

  // ---------- 场景 3：全新安装 ----------
  console.log('\n[场景 3] 全新安装（无数据）');
  const fresh = makeStorage();
  const freshResult = await migrateToUuidSchema(fresh);
  check('不执行迁移', freshResult.migrated === false);
  check('reason=empty-install', freshResult.reason === 'empty-install', freshResult.reason);
  check('直接打上最新版本号', fresh.map.get('kaoyan_schema_version') === String(CURRENT_SCHEMA_VERSION));
  check('不产生无意义备份', !fresh.map.has('kaoyan_migration_backup_v1'));

  // ---------- 场景 4：坏数据不应中断迁移 ----------
  console.log('\n[场景 4] 损坏的 JSON 不中断迁移');
  const broken = makeStorage({
    kaoyan_words: JSON.stringify([{ id: 1, word: 'ok', definitions: [], difficulty: 1, frequency: 1 }]),
    kaoyan_study_records: '{ this is not valid json',
  });
  const brokenResult = await migrateToUuidSchema(broken);
  check('迁移仍然完成', brokenResult.migrated === true, JSON.stringify(brokenResult));
  check('坏键退化为空数组', Array.isArray(broken.read('kaoyan_study_records')) && broken.read('kaoyan_study_records').length === 0);
  check('好数据正常迁移', UUID_RE.test(broken.read('kaoyan_words')[0].id));

  // ---------- 场景 5：字符串化的数字 ID（JSON 往返产生） ----------
  console.log('\n[场景 5] 字符串化的数字 ID 也能映射');
  const strIds = makeStorage({
    kaoyan_words: JSON.stringify([{ id: 1, word: 'alpha', definitions: [], difficulty: 1, frequency: 1 }]),
    kaoyan_study_records: JSON.stringify([
      { id: 1, word_id: '1', study_date: '2026-08-01', result: 1, study_mode: 'flashcard' },
    ]),
  });
  await migrateToUuidSchema(strIds);
  const sw = strIds.read('kaoyan_words');
  const sr = strIds.read('kaoyan_study_records');
  check('"1" 与 1 视为同一个词，记录未被丢弃', sr.length === 1, `实际 ${sr.length}`);
  check('外键正确闭合', sr.length === 1 && sr[0].word_id === sw[0].id);

  fs.rmSync(OUT, { recursive: true, force: true });

  console.log(
    failures === 0
      ? '\n全部断言通过。'
      : `\n${failures} 条断言失败。`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('测试脚本异常:', err);
  process.exit(1);
});
