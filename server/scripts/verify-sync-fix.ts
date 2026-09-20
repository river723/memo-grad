/**
 * /api/sync 端到端验证（修复后回归）。
 *
 * 跑法：cd server && npx tsx scripts/verify-sync-fix.ts
 *
 * 覆盖三件事：
 *   1. realExamWrongQuestion（@@id([userId, questionId]) 复合主键、无 id 列）
 *      push → 之前抛 PrismaClientValidationError 导致整个 /api/sync 500；现在应 200 并落库
 *   2. 同一条再推一次（模拟 wrong_count++）→ 应 update 而非新建，行数不增
 *   3. word（单列主键）push → 回归检查，确认 findUnique → findFirst 的改动没破坏原有路径
 *
 * 用独立测试用户 + 固定 questionId，跑完清理，不碰真实数据。
 */
import { buildApp } from '../src/index';
import { prisma } from '../src/db';

const TEST_EMAIL = `sync-fix-verify-${Date.now()}@example.com`;
const QID = 'verify-sync-fix-q1';
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

  // 走邮箱注册拿 token：随机邮箱不会与真实用户撞，无需登录墙依赖验证码通道
  const regRes = await post('/auth/register-email', {
    email: TEST_EMAIL,
    password: 'verify-pass-123456',
    deviceId: 'verify-sync-fix',
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

  try {
    // ---- 1) 复合主键实体：客户端真实形状（camelCase 内容 + snake_case 元数据，无 id）----
    console.log('\n[1] realExamWrongQuestion push（原先 500 的路径）');
    const q1 = await sync({
      lastSyncAt: null,
      entities: {
        realExamWrongQuestion: [
          {
            questionId: QID,
            year: 2024,
            setId: 'english1',
            mode: 'cloze',
            paperId: 'verify-paper-1',
            blankIndex: 3,
            options: ['A) foo', 'B) bar', 'C) baz', 'D) qux'],
            correctAnswer: 'B',
            userAnswer: 'A',
            wrong_count: 1,
            correct_count: 0,
            last_attempt_at: now(),
            created_at: now(),
            updated_at: now(),
            deleted_at: null,
            dirty: true,
          },
        ],
      },
    });
    assert(q1.statusCode === 200, `/api/sync 返回 200（实际 ${q1.statusCode}）`);
    const b1 = q1.json();
    assert(b1.results?.realExamWrongQuestion?.saved === 1, '服务端 saved=1');

    const rows1 = await prisma.realExamWrongQuestion.findMany({
      where: { userId: userId },
    });
    assert(rows1.length === 1, `落库 1 行（实际 ${rows1.length}）`);
    assert(rows1[0].questionId === QID, 'questionId 正确');
    assert(rows1[0].wrongCount === 1 && rows1[0].userAnswer === 'A', '内容字段正确映射');
    assert(rows1[0].createdAt instanceof Date, 'createdAt 已落库');

    // ---- 2) 再次推送同一条：应 update，不新建 ----
    console.log('\n[2] 同一条重复推送（应 update，不重复）');
    const t2 = now();
    const q2 = await sync({
      lastSyncAt: null,
      entities: {
        realExamWrongQuestion: [
          {
            questionId: QID,
            year: 2024,
            setId: 'english1',
            mode: 'cloze',
            paperId: 'verify-paper-1',
            blankIndex: 3,
            options: ['A) foo', 'B) bar', 'C) baz', 'D) qux'],
            correctAnswer: 'B',
            userAnswer: 'C',
            wrong_count: 2,
            correct_count: 0,
            last_attempt_at: t2,
            created_at: t2,
            updated_at: t2,
            deleted_at: null,
            dirty: true,
          },
        ],
      },
    });
    assert(q2.statusCode === 200, `/api/sync 返回 200（实际 ${q2.statusCode}）`);
    const rows2 = await prisma.realExamWrongQuestion.findMany({ where: { userId: userId } });
    assert(rows2.length === 1, `仍为 1 行，未重复（实际 ${rows2.length}）`);
    assert(rows2[0].wrongCount === 2 && rows2[0].userAnswer === 'C', '字段已更新');
    assert(rows2[0].createdAt instanceof Date, 'createdAt 未被 update 刷新为非 Date');

    // ---- 3) 单列主键实体回归 ----
    console.log('\n[3] word push（回归：findUnique → findFirst 改动）');
    const q3 = await sync({
      lastSyncAt: null,
      entities: {
        word: [
          {
            id: 'verify-word-0001',
            word: 'VerifyFixWord',
            definitions: [{ en: 'a test word', zh: '一个测试词' }],
            difficulty: 3,
            frequency: 3,
            created_at: now(),
            updated_at: now(),
            deleted_at: null,
            dirty: true,
          },
        ],
      },
    });
    assert(q3.statusCode === 200, `/api/sync 返回 200（实际 ${q3.statusCode}）`);
    assert(q3.json().results?.word?.saved === 1, 'word saved=1');
    const w = await prisma.word.findFirst({ where: { userId: userId } });
    assert(w?.word === 'VerifyFixWord', 'word 落库正确');

    // ---- 4) 缺 createdAt 的兜底 ----
    console.log('\n[4] 客户端漏传 createdAt（兜底路径）');
    const q4 = await sync({
      lastSyncAt: null,
      entities: {
        realExamWrongQuestion: [
          {
            questionId: 'verify-sync-fix-q2',
            year: 2024,
            setId: 'english1',
            mode: 'reading',
            paperId: 'verify-paper-2',
            stem: 'Q',
            options: ['A) a', 'B) b', 'C) c', 'D) d'],
            correctAnswer: 'A',
            userAnswer: null,
            wrong_count: 1,
            correct_count: 0,
            last_attempt_at: now(),
            updated_at: now(),
            deleted_at: null,
            dirty: true,
          },
        ],
      },
    });
    assert(q4.statusCode === 200, `/api/sync 返回 200（实际 ${q4.statusCode}）`);
    const q2row = await prisma.realExamWrongQuestion.findFirst({
      where: { userId: userId, questionId: 'verify-sync-fix-q2' },
    });
    assert(!!q2row?.createdAt, '缺 createdAt 时由服务端兜底填入');

    console.log('\n✓ 全部通过');
  } finally {
    // 清理测试数据
    await prisma.realExamWrongQuestion.deleteMany({ where: { userId: userId } });
    await prisma.word.deleteMany({ where: { userId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n✗ 验证失败:', e);
  process.exitCode = 1;
});
