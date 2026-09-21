/**
 * /api/sync 按条容错回归验证。
 *
 * 跑法：cd server && npx tsx scripts/verify-sync-resilience.ts
 *
 * 核心断言：一批推送里混有坏行时，/api/sync 仍返回 200——
 *   - 好行照常被服务端保存
 *   - 坏行进 results.<entity>.skipped（带原因），不再 500 吞掉整次同步
 *   - 其他实体的推送与拉取结果照常返回
 * 这修复的是"一行坏数据 → 整条同步链路永久 500 → dirty 永不清除"的死循环。
 */
import { buildApp } from '../src/index';
import { prisma } from '../src/db';

const EMAIL = `sync-resilience-${Date.now()}@example.com`;
const now = () => new Date().toISOString();

async function main() {
  const app = await buildApp();
  await app.ready();

  const post = async (url: string, body: unknown, token?: string) =>
    app.inject({
      method: 'POST',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      payload: body,
    });

  const regRes = await post('/auth/register-email', {
    email: EMAIL,
    password: 'verify-pass-123456',
    deviceId: 'sync-resilience',
    platform: 'web',
  });
  if (regRes.statusCode !== 200) throw new Error(`register-email 失败 ${regRes.statusCode}: ${regRes.body}`);
  const token = regRes.json().accessToken;
  const userId = regRes.json().user.id;
  const sync = (body: unknown) => post('/api/sync', body, token);

  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
    console.log(`  ✓ ${msg}`);
  };

  const wq = (questionId: string, over: Record<string, unknown> = {}) => ({
    questionId, year: 2024, setId: 'english1', mode: 'cloze', paperId: 'p1',
    blankIndex: 1, options: ['A) a', 'B) b', 'C) c', 'D) d'],
    correctAnswer: 'A', userAnswer: 'B',
    wrong_count: 1, correct_count: 0,
    last_attempt_at: now(), created_at: now(), updated_at: now(),
    deleted_at: null, dirty: true, ...over,
  });

  try {
    // ---- 1) 好行 + 坏行混批：缺 NOT NULL 列 ----
    console.log('\n[1] 同批混入坏行（缺 last_attempt_at / accuracy / study_mode）');
    const r1 = await sync({
      lastSyncAt: null,
      entities: {
        wrongQuestion: [
          { id: 'wq-good', question: { word_id: '' }, wrong_answer: 'B', correct_count: 0, wrong_count: 1, last_attempt_at: now(), deleted_at: null, dirty: true },
          { id: 'wq-bad', question: { word_id: '' }, wrong_answer: 'B', correct_count: 0, wrong_count: 1, deleted_at: null, dirty: true },
        ],
        examSession: [
          { id: 'es-good', questions: [], answers: [], question_type: 'word', accuracy: 0.8, created_at: now(), deleted_at: null, dirty: true },
          { id: 'es-bad', questions: [], answers: [], question_type: 'word', created_at: now(), deleted_at: null, dirty: true },
        ],
        studyRecord: [
          { id: 'sr-good', word_id: '', study_date: '2026-09-21', result: 1, study_mode: 'new', deleted_at: null, dirty: true },
          { id: 'sr-bad', word_id: '', study_date: '2026-09-21', result: 1, deleted_at: null, dirty: true },
          { id: 'sr-badtype', word_id: '', study_date: '2026-09-21', result: '1', study_mode: 'new', deleted_at: null, dirty: true },
        ],
        // 回归专项：StudyRecord / StudyPlan 无 created_at 列，c8fb06e 起的
        // 无脑 createdAt 兜底让 Prisma 抛 Unknown argument，整次同步 500。
        studyPlan: [
          { id: 'sp-good', word_id: '', plan_date: '2026-09-21', plan_type: 'new', completed: false, deleted_at: null, dirty: true },
        ],
      },
    });
    assert(r1.statusCode === 200, `整批返回 200（实际 ${r1.statusCode}）`);
    const b1 = r1.json();

    const savedWq = b1.results?.wrongQuestion?.saved;
    assert(savedWq === 1, `wrongQuestion 好行 saved=1（实际 ${savedWq}）`);
    const skipWq = b1.results?.wrongQuestion?.skipped;
    assert(Array.isArray(skipWq) && skipWq.length === 1, `wrongQuestion skipped=1（实际 ${JSON.stringify(skipWq)}）`);
    assert(skipWq?.[0].key === 'wq-bad', `skipped 键定位到坏行 wq-bad（实际 ${skipWq?.[0].key}）`);
    assert(/字段缺失|类型不符/.test(skipWq?.[0].reason || ''), `skip 原因可读（${skipWq?.[0].reason}）`);

    assert(b1.results?.examSession?.saved === 1, 'examSession 好行 saved=1');
    assert(b1.results?.examSession?.skipped?.[0]?.key === 'es-bad', 'examSession 坏行被跳过');

    assert(b1.results?.studyRecord?.saved === 1, 'studyRecord 好行 saved=1');
    assert(b1.results?.studyRecord?.skipped?.length === 2, `studyRecord 坏行 2 条被跳过（缺列 + 类型不符）`);

    // c8fb06e 回归：studyPlan 无 created_at 列，不能因 createdAt 兜底而 500
    assert(b1.results?.studyPlan?.saved === 1, 'studyPlan（无 created_at 列）saved=1 —— c8fb06e 回归已修');
    assert(b1.results?.studyPlan?.skipped?.length === 0, 'studyPlan 无坏行被误跳过');

    // 落库核对：只有好行进库
    const rows = await prisma.$transaction([
      prisma.wrongQuestion.findMany({ where: { userId } }),
      prisma.examSession.findMany({ where: { userId } }),
      prisma.studyRecord.findMany({ where: { userId } }),
      prisma.studyPlan.findMany({ where: { userId } }),
    ]);
    assert(rows[0].length === 1 && rows[0][0].id === 'wq-good', 'wrongQuestion 仅好行落库');
    assert(rows[1].length === 1 && rows[1][0].id === 'es-good', 'examSession 仅好行落库');
    assert(rows[2].length === 1 && rows[2][0].id === 'sr-good', 'studyRecord 仅好行落库');
    assert(rows[3].length === 1 && rows[3][0].id === 'sp-good', 'studyPlan 好行落库');

    // 拉取结果照常返回（这正是旧实现 500 时丢失的东西）
    assert(Array.isArray(b1.entities?.wrongQuestion) && b1.entities.wrongQuestion.length >= 1, '拉取结果照常返回');
    assert(typeof b1.serverTime === 'string' && b1.serverTime, 'serverTime 照常返回');

    // ---- 2) 复合主键实体同批坏行 ----
    console.log('\n[2] realExamWrongQuestion 混入坏行');
    const r2 = await sync({
      lastSyncAt: null,
      entities: {
        realExamWrongQuestion: [
          wq('res-q-good'),
          wq('res-q-bad', { options: null, last_attempt_at: null }),
        ],
      },
    });
    assert(r2.statusCode === 200, `返回 200（实际 ${r2.statusCode}）`);
    assert(r2.json().results?.realExamWrongQuestion?.saved === 1, '好行 saved=1');
    assert(r2.json().results?.realExamWrongQuestion?.skipped?.length === 1, '坏行被跳过');

    // ---- 3) 坏行留在客户端时不会误清 dirty：服务端不再报它已保存 ----
    console.log('\n[3] 重复推送同一坏行（应仍被跳过，不是静默成功）');
    const r3 = await sync({
      lastSyncAt: null,
      entities: {
        studyRecord: [{ id: 'sr-bad', word_id: '', study_date: '2026-09-21', result: 1, deleted_at: null, dirty: true }],
      },
    });
    assert(r3.statusCode === 200, '返回 200');
    assert(r3.json().results?.studyRecord?.saved === 0, '坏行 saved=0（不会被误判为已同步）');
    assert(r3.json().results?.studyRecord?.skipped?.length === 1, '坏行仍在 skipped 中');

    // ---- 4) 回归：word 去重 + 重定向仍正常 ----
    console.log('\n[4] 回归：word 跨设备同词去重');
    await sync({
      lastSyncAt: null,
      entities: { word: [{ id: 'wd-a', word: 'Resilience', definitions: [{ en: 'x', zh: 'x' }], created_at: now(), updated_at: now(), deleted_at: null, dirty: true }] },
    });
    const r4 = await sync({
      lastSyncAt: null,
      entities: { word: [{ id: 'wd-b', word: 'RESILIENCE', definitions: [{ en: 'y', zh: 'y' }], created_at: now(), updated_at: now(), deleted_at: null, dirty: true }] },
    });
    assert(r4.statusCode === 200, '返回 200');
    assert(r4.json().results?.word?.saved === 1, '合并进 canonical 行仍计 saved=1');
    assert(r4.json().wordRedirects?.[0]?.from === 'wd-b' && r4.json().wordRedirects?.[0]?.to === 'wd-a', '重定向正常下发');
    const wordCount = await prisma.word.count({ where: { userId } });
    assert(wordCount === 1, `仍只有一行词（实际 ${wordCount}）`);

    console.log('\n✓ 全部通过');
  } finally {
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n✗ 验证失败:', e);
  process.exitCode = 1;
});
