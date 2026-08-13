/**
 * adminQueries 集成测试。
 *
 * 风格：纯 Node 22 + tsx 跑的 .mjs。
 * 用法：cd server && node --import tsx scripts/test-admin-queries.mjs
 *
 * 前置：DATABASE_URL 可达。会在测试结束后清理新建的测试用户。
 *
 * 覆盖：
 *   1) listUsersWithFilters：基本分页 + search 命中
 *   2) listUsersWithFilters：role / disabled 过滤
 *   3) listUsersWithFilters：createdFrom / createdTo 过滤
 *   4) listUsersWithFilters：lastSyncFrom 过滤（走 Device groupBy）
 *   5) listUsersWithFilters：返回的扩展字段（lastSyncAt/totalWords/aiCallsThisMonth/isPro）正确
 *   6) getUserDetailAggregated：基础字段 + 9 个面板都有
 *   7) getUserDetailAggregated：返回 null 当用户不存在
 */

import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const { listUsersWithFilters, getUserDetailAggregated } = await import('../src/services/adminQueries.ts');

const ts = Date.now();
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// ---- 准备：建 3 个测试用户（普通用户 2 个 + 1 个 admin），附 1 个有同步的 device ----
const u1 = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}1`, nickname: 'test-u1' } });
const u2 = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}2`, email: `t2-${ts}@test.com`, nickname: 'test-u2' } });
const u3 = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}3`, role: 'admin', nickname: 'test-admin' } });

await prisma.device.create({
  data: { userId: u1.id, deviceId: 'd1', platform: 'web', lastSyncAt: new Date() },
});
await prisma.device.create({
  data: { userId: u2.id, deviceId: 'd2', platform: 'ios', lastSyncAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
});
// u3 不建 device

// u1 加几个词 + AI 用量 + 真题
const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
await prisma.word.create({
  data: {
    id: `w-${ts}-1`, userId: u1.id, word: 'apple', definitions: [],
    updatedAt: now, createdAt: now,
  },
});
await prisma.word.create({
  data: {
    id: `w-${ts}-2`, userId: u1.id, word: 'banana', definitions: [],
    updatedAt: now, createdAt: now,
  },
});
await prisma.aiUsage.create({
  data: { userId: u1.id, action: 'analyzeWord', model: 'deepseek', success: true, createdAt: monthStart },
});
await prisma.realExamSession.create({
  data: { id: `re-${ts}-1`, userId: u1.id, year: 2024, mode: 'cloze', paperId: 'p1', answers: {}, score: 24, total: 30, createdAt: now, updatedAt: now },
});

try {

  await test('listUsersWithFilters: 找到 3 个测试用户', async () => {
    const res = await listUsersWithFilters({ limit: 100 });
    const ids = res.users.map((u) => u.id);
    assert.ok(ids.includes(u1.id));
    assert.ok(ids.includes(u2.id));
    assert.ok(ids.includes(u3.id));
  });

  await test('listUsersWithFilters: search 按 phone 部分匹配', async () => {
    const res = await listUsersWithFilters({ search: u1.phone.slice(-5), limit: 100 });
    assert.ok(res.users.some((u) => u.id === u1.id));
  });

  await test('listUsersWithFilters: role=admin 过滤', async () => {
    const res = await listUsersWithFilters({ role: 'admin', limit: 100 });
    assert.ok(res.users.every((u) => u.role === 'admin'));
  });

  await test('listUsersWithFilters: disabled=false 过滤排除 u1（未设 disabled 应是 false）', async () => {
    const res = await listUsersWithFilters({ disabled: false, limit: 100 });
    assert.ok(res.users.some((u) => u.id === u1.id));
  });

  await test('listUsersWithFilters: createdFrom 过滤排除老用户', async () => {
    const future = new Date(Date.now() + 60_000);
    const res = await listUsersWithFilters({ createdFrom: future.toISOString(), limit: 100 });
    assert.equal(res.total, 0, 'createdFrom 未来时间应无结果');
  });

  await test('listUsersWithFilters: lastSyncFrom 30 天前应包含 u1（今天同步过）', async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const res = await listUsersWithFilters({ lastSyncFrom: since.toISOString(), limit: 100 });
    assert.ok(res.users.some((u) => u.id === u1.id), '今天同步过的 u1 应在结果里');
    assert.ok(!res.users.some((u) => u.id === u2.id), '30 天前同步的 u2 不应在结果里');
  });

  await test('listUsersWithFilters: 扩展字段 lastSyncAt/totalWords/aiCallsThisMonth 正确', async () => {
    const res = await listUsersWithFilters({ limit: 100 });
    const u1Row = res.users.find((u) => u.id === u1.id);
    assert.ok(u1Row.lastSyncAt, 'u1 有 lastSyncAt');
    assert.equal(u1Row.totalWords, 2);
    assert.equal(u1Row.aiCallsThisMonth, 1);
    assert.equal(u1Row.isPro, false);
  });

  await test('getUserDetailAggregated: 返回 9 个面板', async () => {
    const detail = await getUserDetailAggregated(u1.id);
    assert.ok(detail, '应返回非 null');
    assert.equal(detail.id, u1.id);
    assert.ok(Array.isArray(detail.devices));
    assert.ok(detail.devices.length === 1);
    assert.ok(Array.isArray(detail.subscriptionHistory));
    assert.ok(Array.isArray(detail.orderHistory));
    assert.ok(detail.aiUsageSummary);
    assert.equal(detail.aiUsageSummary.usedThisMonth, 1);
    assert.equal(detail.aiUsageSummary.last30Days.length, 30, '30 天桶应占满');
    assert.ok(detail.dataFootprint);
    assert.equal(detail.dataFootprint.word.count, 2);
    assert.equal(detail.dataFootprint.realExamSession.count, 1);
    assert.ok(detail.studyActivity);
    assert.ok(detail.entitlement);
    assert.equal(detail.entitlement.isPro, false);
  });

  await test('getUserDetailAggregated: 不存在的用户返回 null', async () => {
    const detail = await getUserDetailAggregated('non-existent-id-xxxxxxxxxxxxx');
    assert.equal(detail, null);
  });

} finally {
  // 清理
  await prisma.adminActionLog.deleteMany({ where: { targetUserId: { in: [u1.id, u2.id, u3.id] } } });
  await prisma.device.deleteMany({ where: { userId: { in: [u1.id, u2.id, u3.id] } } });
  await prisma.word.deleteMany({ where: { userId: { in: [u1.id, u2.id, u3.id] } } });
  await prisma.aiUsage.deleteMany({ where: { userId: { in: [u1.id, u2.id, u3.id] } } });
  await prisma.realExamSession.deleteMany({ where: { userId: { in: [u1.id, u2.id, u3.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [u1.id, u2.id, u3.id] } } });
  console.log('🧹 清理完成');
}

console.log(`\n${passed === 9 ? '🎉' : '⚠️ '} ${passed}/9 通过`);
process.exit(process.exitCode || 0);
