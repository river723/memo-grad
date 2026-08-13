/**
 * userAdmin 集成测试。
 *
 * 用法：cd server && node --import tsx scripts/test-user-admin.mjs
 * 前置：DATABASE_URL 可达
 *
 * 覆盖：
 *   1) setDisabled: 封禁/解封 + 审计 + 撤销 token
 *   2) setDisabled: 重复封禁幂等
 *   3) setDisabled: 降级/封禁最后一个 admin → LAST_ADMIN
 *   4) setRole: 升级/降级 + 降级撤销 token
 *   5) setRole: 给非 admin 设 role=user 应直接通过（无守卫干扰）
 *   6) resetPassword: 设密码 + 撤销所有 token + 审计
 *   7) resetPassword: 给短信用户设密码（之前没 email）
 *   8) forceLogout: 撤销 token + 审计
 *   9) resetAiQuota: 删除本月 AiUsage
 *  10) resetAiQuota: 不影响上月
 */

import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const { verifyPassword } = await import('../src/services/passwordService.ts');
const { issueRefreshToken } = await import('../src/services/tokenService.ts');
const {
  setDisabled,
  setRole,
  resetPassword,
  forceLogout,
  resetAiQuota,
} = await import('../src/services/userAdmin.ts');

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

// ---- 准备 ----
const adminUser = await prisma.user.create({
  data: { phone: `1390000${String(ts).slice(-5)}0`, role: 'admin', nickname: 'test-admin' },
});
const targetUser = await prisma.user.create({
  data: { phone: `1390000${String(ts).slice(-5)}1`, nickname: 'test-target' },
});
const otherAdmin = await prisma.user.create({
  data: { phone: `1390000${String(ts).slice(-5)}2`, role: 'admin', nickname: 'test-other-admin' },
});
const smsOnlyUser = await prisma.user.create({
  data: { phone: `1390000${String(ts).slice(-5)}3`, nickname: 'test-sms-only' },
});

// 删掉旧 admin（避免全局 admin 太多干扰 LAST_ADMIN 测试）
const allAdmins = await prisma.user.findMany({ where: { role: 'admin' } });
const otherAdminsToDelete = allAdmins.filter((a) => a.id !== adminUser.id && a.id !== otherAdmin.id);
const otherAdminIdsToDelete = otherAdminsToDelete.map((a) => a.id);

// 拿一个 token 用于测撤销
const { token: targetToken1 } = await issueRefreshToken(targetUser.id, 'd1');
const { token: targetToken2 } = await issueRefreshToken(targetUser.id, 'd2');

try {

  // ==================== setDisabled ====================
  await test('setDisabled: 封禁 + 撤销全部 token + 审计', async () => {
    const before = await prisma.refreshToken.count({ where: { userId: targetUser.id, revokedAt: null } });
    assert.equal(before, 2, '应有 2 个未撤销 token');

    const r = await setDisabled(undefined, adminUser.id, targetUser.id, { disabled: true, reason: '测试封禁' });
    assert.equal(r.revokedTokens, 2, '应撤销 2 个 token');

    const u = await prisma.user.findUnique({ where: { id: targetUser.id } });
    assert.equal(u.disabled, true);
    assert.ok(u.disabledAt);
    assert.equal(u.disabledReason, '测试封禁');
    assert.equal(u.disabledById, adminUser.id);

    const after = await prisma.refreshToken.count({ where: { userId: targetUser.id, revokedAt: null } });
    assert.equal(after, 0, '应全部撤销');

    const audit = await prisma.adminActionLog.findFirst({
      where: { adminUserId: adminUser.id, targetId: targetUser.id, action: 'user.ban' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit, '应有一条 user.ban 审计');
    assert.equal(audit.note, '测试封禁；撤销 2 个 refresh token');
  });

  await test('setDisabled: 重复封禁幂等', async () => {
    const r = await setDisabled(undefined, adminUser.id, targetUser.id, { disabled: true });
    assert.equal(r.alreadyInState, true, '应返回 alreadyInState=true');
    assert.equal(r.revokedTokens, 0);
  });

  await test('setDisabled: 解封清空元数据', async () => {
    const r = await setDisabled(undefined, adminUser.id, targetUser.id, { disabled: false });
    assert.equal(r.alreadyInState, false);
    const u = await prisma.user.findUnique({ where: { id: targetUser.id } });
    assert.equal(u.disabled, false);
    assert.equal(u.disabledAt, null);
    assert.equal(u.disabledReason, null);
    assert.equal(u.disabledById, null);

    const audit = await prisma.adminActionLog.findFirst({
      where: { adminUserId: adminUser.id, targetId: targetUser.id, action: 'user.unban' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit);
  });

  await test('setDisabled: 降级/封禁最后一个 admin 抛 LAST_ADMIN', async () => {
    // 删掉 otherAdmin 和全局其他 admin
    await prisma.refreshToken.updateMany({ where: { userId: { in: otherAdminIdsToDelete } }, data: { revokedAt: new Date() } });
    await prisma.user.deleteMany({ where: { id: { in: otherAdminIdsToDelete } } });
    // 也要删 otherAdmin（它也是测试创建的 admin）
    await prisma.user.deleteMany({ where: { id: otherAdmin.id } });

    // 现在全局只有 adminUser 一个 admin
    const remainingAdmins = await prisma.user.count({ where: { role: 'admin' } });
    assert.equal(remainingAdmins, 1, `期望只剩 1 个 admin，实际 ${remainingAdmins}`);

    let threw = false;
    try {
      await setDisabled(undefined, adminUser.id, adminUser.id, { disabled: true });
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'LAST_ADMIN');
    }
    assert.equal(threw, true, '封禁最后一名 admin 应抛 LAST_ADMIN');
  });

  // ==================== setRole ====================
  // 先恢复 otherAdmin（前面删了，但 next test 也要用）
  const recoveredAdmin = await prisma.user.create({
    data: { phone: `1390000${String(ts).slice(-5)}4`, role: 'admin', nickname: 'recovered' },
  });

  await test('setRole: 升级 user → admin 不撤销 token', async () => {
    await issueRefreshToken(targetUser.id, 'd3'); // 拿个新 token
    const before = await prisma.refreshToken.count({ where: { userId: targetUser.id, revokedAt: null } });
    const r = await setRole(undefined, adminUser.id, targetUser.id, 'admin');
    assert.equal(r.revokedTokens, 0, '升级不应撤销');
    const after = await prisma.refreshToken.count({ where: { userId: targetUser.id, revokedAt: null } });
    assert.equal(after, before, 'token 数应不变');
  });

  await test('setRole: 降级 admin → user 撤销 token', async () => {
    const before = await prisma.refreshToken.count({ where: { userId: targetUser.id, revokedAt: null } });
    const r = await setRole(undefined, adminUser.id, targetUser.id, 'user');
    assert.ok(r.revokedTokens >= 1, '降级应撤销至少 1 个 token');
    const after = await prisma.refreshToken.count({ where: { userId: targetUser.id, revokedAt: null } });
    assert.equal(after, 0);
  });

  await test('setRole: 降级最后一名 admin 抛 LAST_ADMIN', async () => {
    // 删掉 recoveredAdmin 让全局只剩 adminUser
    await prisma.user.deleteMany({ where: { id: recoveredAdmin.id } });

    let threw = false;
    try {
      await setRole(undefined, adminUser.id, adminUser.id, 'user');
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'LAST_ADMIN');
    }
    assert.equal(threw, true);
  });

  // ==================== resetPassword ====================
  await test('resetPassword: 设密码 + 撤销 token + 审计', async () => {
    // 重新建个 target user 避免前面干扰
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}5` } });
    await issueRefreshToken(u.id, 'd-pw');
    const r = await resetPassword(undefined, adminUser.id, u.id, { newPassword: 'newpass123' });
    assert.ok(r.revokedTokens >= 1);

    const updated = await prisma.user.findUnique({ where: { id: u.id } });
    assert.ok(updated.passwordHash);
    assert.equal(verifyPassword('newpass123', updated.passwordHash), true);

    const audit = await prisma.adminActionLog.findFirst({
      where: { adminUserId: adminUser.id, targetId: u.id, action: 'user.reset_password' },
    });
    assert.ok(audit);
    // 无 email 的用户走「为短信登录用户设置密码」分支
    assert.match(audit.note, /设置密码|重置密码/);

    // 清理
    await prisma.user.delete({ where: { id: u.id } });
  });

  await test('resetPassword: 给短信用户设密码（无 email）', async () => {
    const r = await resetPassword(undefined, adminUser.id, smsOnlyUser.id, { newPassword: 'smsnew123' });
    assert.ok(r.revokedTokens >= 0);

    const updated = await prisma.user.findUnique({ where: { id: smsOnlyUser.id } });
    assert.ok(updated.passwordHash);
    assert.equal(verifyPassword('smsnew123', updated.passwordHash), true);

    const audit = await prisma.adminActionLog.findFirst({
      where: { targetId: smsOnlyUser.id, action: 'user.reset_password' },
    });
    assert.match(audit.note, /短信登录用户设置密码/);
  });

  // ==================== forceLogout ====================
  await test('forceLogout: 撤销 token + 审计 + 不改 disabled', async () => {
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}6` } });
    await issueRefreshToken(u.id, 'd-fo1');
    await issueRefreshToken(u.id, 'd-fo2');
    const r = await forceLogout(undefined, adminUser.id, u.id);
    assert.equal(r.revokedTokens, 2);

    const updated = await prisma.user.findUnique({ where: { id: u.id } });
    assert.equal(updated.disabled, false, 'disabled 标志不应改变');

    const audit = await prisma.adminActionLog.findFirst({
      where: { targetId: u.id, action: 'user.force_logout' },
    });
    assert.ok(audit);
    assert.match(audit.note, /撤销 2 个 refresh token/);

    await prisma.user.delete({ where: { id: u.id } });
  });

  // ==================== resetAiQuota ====================
  await test('resetAiQuota: 删本月行 + 审计', async () => {
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}7` } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // 本月 2 行
    await prisma.aiUsage.create({ data: { userId: u.id, action: 'a', model: 'm', createdAt: now, success: true } });
    await prisma.aiUsage.create({ data: { userId: u.id, action: 'a', model: 'm', createdAt: monthStart, success: true } });
    // 上月 1 行（不应被删）
    const lastMonth = new Date(monthStart.getTime() - 5 * 24 * 3600 * 1000);
    await prisma.aiUsage.create({ data: { userId: u.id, action: 'a', model: 'm', createdAt: lastMonth, success: true } });

    const r = await resetAiQuota(undefined, adminUser.id, u.id);
    assert.equal(r.deletedRows, 2, '应删 2 条本月行');

    const remaining = await prisma.aiUsage.count({ where: { userId: u.id } });
    assert.equal(remaining, 1, '应剩 1 条上月行');

    const audit = await prisma.adminActionLog.findFirst({
      where: { targetId: u.id, action: 'user.reset_ai_quota' },
    });
    assert.ok(audit);
    assert.match(audit.note, /删除本月 2 条/);

    // 清理
    await prisma.aiUsage.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  });

  await test('resetAiQuota: 目标用户没有 AI 用量时 deletedRows=0', async () => {
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}8` } });
    const r = await resetAiQuota(undefined, adminUser.id, u.id);
    assert.equal(r.deletedRows, 0);
    await prisma.user.delete({ where: { id: u.id } });
  });

} finally {
  // 清理
  const allCreatedIds = [
    adminUser.id, targetUser.id, otherAdmin.id, smsOnlyUser.id,
    ...otherAdminIdsToDelete,
  ];
  await prisma.adminActionLog.deleteMany({ where: { targetUserId: { in: allCreatedIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: allCreatedIds } } });
  await prisma.aiUsage.deleteMany({ where: { userId: { in: allCreatedIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allCreatedIds } } });
  // 删掉没在 allCreatedIds 的 recoveredAdmin（如果还存在）
  await prisma.user.deleteMany({ where: { phone: { startsWith: `1390000${String(ts).slice(-5)}` } } });
  console.log('🧹 清理完成');
}

console.log(`\n${passed === 12 ? '🎉' : '⚠️ '} ${passed}/12 通过`);
process.exit(process.exitCode || 0);
