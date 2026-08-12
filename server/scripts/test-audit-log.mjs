/**
 * 审计日志集成测试。
 *
 * 风格：纯 Node 22 + tsx 跑的 .mjs（沿用项目约定）。
 * 用法：cd server && node --import tsx scripts/test-audit-log.mjs
 *
 * 前置：DATABASE_URL 可达（docker compose up -d 起本地库）
 *
 * 覆盖：
 *   1) 必填字段缺失抛 Error
 *   2) 正常写入后能查到记录，字段透传正确
 *   3) targetType='user' 时 targetUserId 冗余写入
 *   4) prisma 抛错时 writeAuditLog 不向外抛（best-effort）
 */

import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL（docker compose up -d 后再跑）');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const { writeAuditLog } = await import('../src/services/auditLog.ts');

const ts = Date.now();
const adminId = `test-admin-${ts}`;
const targetId = `test-target-${ts}`;

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

await test('必填字段缺失抛错', async () => {
  let threw = false;
  try {
    await writeAuditLog(undefined, 'admin', { action: '', targetType: 'user', targetId: 'x' });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});

await test('正常写入字段正确', async () => {
  await writeAuditLog(undefined, adminId, {
    action: 'user.ban',
    targetType: 'user',
    targetId,
    before: { disabled: false },
    after: { disabled: true, disabledReason: '单元测试' },
    note: 'integration-test',
  });
  const found = await prisma.adminActionLog.findFirst({ where: { adminUserId: adminId, targetId } });
  assert.ok(found, '应能查到刚写的记录');
  assert.equal(found.action, 'user.ban');
  assert.equal(found.targetType, 'user');
  assert.equal(found.targetUserId, targetId, 'targetType=user 应冗余写 targetUserId');
  assert.equal(found.note, 'integration-test');
  assert.equal(found.before.disabled, false);
  assert.equal(found.after.disabled, true);
  assert.equal(found.after.disabledReason, '单元测试');
});

await test('targetType=order 不冗余 targetUserId', async () => {
  await writeAuditLog(undefined, adminId, {
    action: 'sub.refund',
    targetType: 'order',
    targetId: `test-order-${ts}`,
  });
  const found = await prisma.adminActionLog.findFirst({
    where: { adminUserId: adminId, targetId: `test-order-${ts}` },
  });
  assert.ok(found);
  assert.equal(found.targetUserId, null);
});

await test('prisma 抛错时不向外抛（best-effort）', async () => {
  // 用一个非法 UUID 触发 Prisma 抛错（如果 schema 不接受空串）
  // 这里用一个过长的 targetId 让 Prisma 抛错（admin_action_logs.target_id 是 TEXT，理论上不限长）
  // 改用：传入循环引用对象作为 before，触发 Prisma JSON 校验错误
  const circular = {};
  circular.self = circular;
  let threw = false;
  try {
    await writeAuditLog(undefined, adminId, {
      action: 'user.ban',
      targetType: 'user',
      targetId: `test-circular-${ts}`,
      before: circular,
    });
  } catch {
    threw = true;
  }
  // best-effort：不向外抛。circular 会被 Prisma JSON 序列化拒绝
  assert.equal(threw, false, 'writeAuditLog 应该吞掉 Prisma 错误');
});

// 清理测试数据
await prisma.adminActionLog.deleteMany({ where: { adminUserId: adminId } });

console.log(`\n${passed === 4 ? '🎉' : '⚠️ '} ${passed}/4 通过`);
process.exit(process.exitCode || 0);
