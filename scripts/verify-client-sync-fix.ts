/**
 * 客户端修复验证：拉取形状归一化 + v3→v4 去重迁移。
 *
 * 跑法：npx tsx scripts/verify-client-sync-fix.ts
 *
 * 纯逻辑验证，用内存 Map 当 AsyncStorage，不碰真实存储。
 */
import {
  REAL_EXAM_WRONG_PULL_RENAME,
  normalizeRealExamWrongPull,
  realExamWrongMergeKey,
} from '../src/services/realExamWrongShape';
import { migrateToUuidSchema, CURRENT_SCHEMA_VERSION } from '../src/services/migrations';

const ok = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return Promise.resolve(this.m.get(key) ?? null);
  }
  setItem(key: string, value: string) {
    this.m.set(key, value);
    return Promise.resolve();
  }
  dump() {
    return this.m;
  }
}

// ---- 1) 形状归一化 ----
async function testNormalize() {
  console.log('\n[1] 拉取形状归一化');
  // 服务端 toSnakeCase 后的真实形状
  const pulled = {
    user_id: 'u1',
    question_id: 'paper-1-b3',
    year: 2024,
    set_id: 'english1',
    mode: 'cloze',
    paper_id: 'paper-1',
    paper_title: null,
    blank_index: 3,
    stem: null,
    options: ['A) a', 'B) b', 'C) c', 'D) d'],
    correct_answer: 'B',
    user_answer: 'A',
    explanation: '因为',
    wrong_count: 2,
    correct_count: 0,
    last_attempt_at: '2026-09-20T00:00:00.000Z',
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
    deleted_at: null,
    dirty: false,
  };

  const n = normalizeRealExamWrongPull(pulled);
  ok(n.questionId === 'paper-1-b3', 'question_id → questionId');
  ok(n.paperId === 'paper-1' && n.setId === 'english1', 'paper_id/set_id → 驼峰');
  ok(n.paperTitle === null && n.blankIndex === 3, 'paper_title/blank_index → 驼峰');
  ok(n.correctAnswer === 'B' && n.userAnswer === 'A', 'correct_answer/user_answer → 驼峰');
  ok(!('question_id' in n) && !('paper_id' in n), '原 snake 键已移除');
  ok(
    n.wrong_count === 2 && n.correct_count === 0 && n.last_attempt_at === pulled.last_attempt_at,
    '计数与元数据保持 snake_case 不动'
  );
  ok(realExamWrongMergeKey(n) === 'paper-1-b3', '合并键取 questionId');

  // 已经是本地形状 → 原样返回同一引用（无副作用）
  const local = { questionId: 'q', wrong_count: 1 };
  ok(normalizeRealExamWrongPull(local) === local, '已是本地形状时返回原引用');

  // 映射表与本地存储的 camelCase 字段一致（防止两端命名漂移）
  const expectedCamel = ['questionId', 'paperId', 'setId', 'paperTitle', 'blankIndex', 'correctAnswer', 'userAnswer'];
  ok(
    JSON.stringify(Object.values(REAL_EXAM_WRONG_PULL_RENAME)) === JSON.stringify(expectedCamel),
    '映射表覆盖全部 7 个不一致字段'
  );
}

// ---- 2) v3 → v4 去重迁移 ----
async function testMigration() {
  console.log('\n[2] v3→v4 真题错题收敛迁移');
  const KEY = 'kaoyan_real_exam_wrong_questions';

  const t = async (name: string, rows: any[], expect: { kept: number; backup: boolean }) => {
    const s = new MemStorage();
    s.setItem(KEY, JSON.stringify(rows));
    // 真实场景：用户已在 v3（v1→v2 早已跑完），只应执行 v3→v4。
    // 不预先设版本号会让 v1→v2 先跑，它会把 deleted_at 一律清成 null，
    // 掩盖 v4 真正要验证的行为。
    s.setItem('kaoyan_schema_version', '3');
    await migrateToUuidSchema(s, (k) => k);
    const out = JSON.parse(s.dump().get(KEY) as string);
    ok(s.dump().has('kaoyan_schema_version'), `${name}: 版本号为 ${s.dump().get('kaoyan_schema_version')}`);
    ok(
      Number(s.dump().get('kaoyan_schema_version')) === CURRENT_SCHEMA_VERSION,
      `${name}: 版本号推进到 ${CURRENT_SCHEMA_VERSION}`
    );
    ok(out.length === expect.kept, `${name}: 收敛后 ${out.length} 行（期望 ${expect.kept}）`);
    ok(
      s.dump().has('kaoyan_migration_backup_v3') === expect.backup,
      `${name}: 备份快照 ${expect.backup ? '已写' : '未写'}`
    );
  };

  // 2a) 重复行 → 按 questionId 保留 updated_at 最新
  await t(
    '重复行去重',
    [
      { questionId: 'q1', wrong_count: 1, updated_at: '2026-09-01T00:00:00.000Z' },
      { questionId: 'q1', wrong_count: 3, updated_at: '2026-09-03T00:00:00.000Z' },
      { questionId: 'q1', wrong_count: 2, updated_at: '2026-09-02T00:00:00.000Z' },
      { questionId: 'q2', wrong_count: 1, updated_at: '2026-09-01T00:00:00.000Z' },
    ],
    { kept: 2, backup: true }
  );

  // 2b) snake_case 行 → 规整为 camelCase 后再去重
  const s2 = new MemStorage();
  s2.setItem('kaoyan_schema_version', '3');
  s2.setItem(
    KEY,
    JSON.stringify([
      { question_id: 'q9', wrong_count: 1, updated_at: '2026-09-02T00:00:00.000Z' },
      { questionId: 'q9', wrong_count: 5, updated_at: '2026-09-05T00:00:00.000Z' },
    ])
  );
  await migrateToUuidSchema(s2, (k) => k);
  const out2 = JSON.parse(s2.dump().get(KEY) as string);
  ok(out2.length === 1, 'snake/camel 混合行按同一 questionId 收敛为 1 行');
  ok(out2[0].questionId === 'q9' && !('question_id' in out2[0]), '保留行已是 camelCase 形状');
  ok(out2[0].wrong_count === 5, '保留 updated_at 最新的一行（wrong_count=5）');

  // 2c) 软删事实随最新行保留
  const s3 = new MemStorage();
  s3.setItem('kaoyan_schema_version', '3');
  s3.setItem(
    KEY,
    JSON.stringify([
      { questionId: 'q7', wrong_count: 1, updated_at: '2026-09-01T00:00:00.000Z' },
      { questionId: 'q7', wrong_count: 1, deleted_at: '2026-09-04T00:00:00.000Z', updated_at: '2026-09-04T00:00:00.000Z' },
    ])
  );
  await migrateToUuidSchema(s3, (k) => k);
  const out3 = JSON.parse(s3.dump().get(KEY) as string);
  ok(out3.length === 1 && !!out3[0].deleted_at, '最新动作是删除 → 软删事实保留（不复活）');

  // 2d) 空列表 → 只推进版本号，不写备份
  const s4 = new MemStorage();
  s4.setItem('kaoyan_schema_version', '3');
  s4.setItem(KEY, JSON.stringify([]));
  await migrateToUuidSchema(s4, (k) => k);
  ok(!s4.dump().has('kaoyan_migration_backup_v3'), '空列表不写备份快照');

  // 2e) 幂等：已收敛数据再跑一次无变化
  const s5 = new MemStorage();
  const settled = [
    { questionId: 'q1', wrong_count: 3, updated_at: '2026-09-03T00:00:00.000Z' },
    { questionId: 'q2', wrong_count: 1, updated_at: '2026-09-01T00:00:00.000Z' },
  ];
  s5.setItem('kaoyan_schema_version', '3');
  s5.setItem(KEY, JSON.stringify(settled));
  await migrateToUuidSchema(s5, (k) => k);
  ok(
    JSON.stringify(JSON.parse(s5.dump().get(KEY) as string)) === JSON.stringify(settled),
    '已收敛数据重跑内容不变（幂等）'
  );

  // 2f) 版本号已是最新 → 直接返回，不动数据也不写备份
  const s6 = new MemStorage();
  s6.setItem('kaoyan_schema_version', String(CURRENT_SCHEMA_VERSION));
  s6.setItem(KEY, JSON.stringify(settled));
  const r6 = await migrateToUuidSchema(s6, (k) => k);
  ok(!r6.migrated, '已是最新版本时返回 migrated=false');
  ok(JSON.stringify(JSON.parse(s6.dump().get(KEY) as string)) === JSON.stringify(settled), '最新版本下数据不变');
  ok(!s6.dump().has('kaoyan_migration_backup_v3'), '最新版本下不写备份');
}

(async () => {
  await testNormalize();
  await testMigration();
  console.log('\n✓ 客户端验证全部通过');
})().catch((e) => {
  console.error('\n✗', e);
  process.exitCode = 1;
});
