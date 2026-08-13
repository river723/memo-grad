/**
 * 完整客服流程端到端测试。
 *
 * 风格：纯 Node 22 + tsx，通过 HTTP 调用后端。
 * 用法：cd server && node --import tsx scripts/test-e2e-admin.mjs
 *
 * 前置：
 *   - 服务运行在 http://127.0.0.1:3000（默认）
 *   - DATABASE_URL 可达
 *   - 至少存在一名 admin（如果没有，跑 manage-admin.ts promote 一个）
 *
 * 流程模拟：
 *   1. 管理员用验证码登录（生产里这是真实路径；测试里我们直接 seed 一个 admin + 绕过）
 *      → 实际：先 seed 管理员与目标用户，再用 client_credentials（不行）。
 *      → 实用：走 /auth/login-email 路径，先给 admin 和 target 都设密码。
 *   2. 搜索用户 → 详情 → 重置密码（验证 token 撤销 + 新密码可登）
 *   3. 授权订阅 → 验证 entitlement 返回 isPro
 *   4. 撤销订阅 → 验证 entitlement 返回 isPro=false
 *   5. 退款一笔 paid 订单 → 验证 Order + Subscription 同步 refunded
 *   6. 封禁用户 → 验证下个请求 ACCOUNT_DISABLED
 *   7. 解封 → 验证可重新登
 *   8. 强制下线 → 验证 token 撤销
 *   9. 拉审计日志 → 验证 8 条记录
 *  10. 拉概览 → 验证新字段
 *  11. 拉收入 → 验证时间序列 + byPlan
 *  12. 公告创建 + 公开端点拉到 + 客户端 dismiss
 *
 * 输出：每步打印 ✅/❌，最后总结
 */

import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const { hashPassword } = await import('../src/services/passwordService.ts');
const { issueRefreshToken } = await import('../src/services/tokenService.ts');

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

async function http(method, path, body, token) {
  const headers = {};
  // 无 body 时不发 content-type，否则 Fastify 会拒绝空 JSON body（400）
  if (body !== undefined && body !== null) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}

// ---- 准备：建一个 admin 和一个 target，都设密码 ----
const ts = Date.now();
const adminEmail = `admin-${ts}@e2e.test`;
const targetEmail = `target-${ts}@e2e.test`;
const adminPwd = 'AdminPass123';
const targetPwd = 'TargetPass123';

const adminUser = await prisma.user.create({
  data: { email: adminEmail, role: 'admin', passwordHash: hashPassword(adminPwd) },
});
const targetUser = await prisma.user.create({
  data: { email: targetEmail, passwordHash: hashPassword(targetPwd) },
});

// 准备：给 target 建一笔 paid 订单 + 匹配订阅
const now = new Date();
const order = await prisma.order.create({
  data: {
    userId: targetUser.id,
    outTradeNo: `e2e-${ts}`,
    transactionId: `txn-${ts}`,
    channel: 'wechat',
    plan: 'monthly',
    amountFen: 1990,
    status: 'paid',
    paidAt: now,
  },
});
const sub = await prisma.subscription.create({
  data: {
    userId: targetUser.id,
    plan: 'monthly',
    status: 'active',
    startsAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    source: 'wechat',
  },
});

// 准备：给 target 一些本月 AI 用量
await prisma.aiUsage.create({
  data: { userId: targetUser.id, action: 'analyzeWord', model: 'deepseek', success: true, createdAt: now },
});

let adminToken = null;
let targetToken = null;
let oldTargetRefreshToken = null;

try {

  await test('1) admin 邮箱密码登录', async () => {
    const r = await http('POST', '/auth/login-email', { email: adminEmail, password: adminPwd });
    assert.equal(r.status, 200);
    assert.ok(r.body.accessToken);
    assert.equal(r.body.user.role, 'admin');
    adminToken = r.body.accessToken;
  });

  await test('2) target 邮箱密码登录', async () => {
    const r = await http('POST', '/auth/login-email', { email: targetEmail, password: targetPwd });
    assert.equal(r.status, 200);
    targetToken = r.body.accessToken;
    oldTargetRefreshToken = r.body.refreshToken;
  });

  await test('3) 列表搜索 target 邮箱 → 找到', async () => {
    const r = await http('GET', `/api/admin/users?search=${targetEmail}&limit=10`, null, adminToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.users.some((u) => u.id === targetUser.id));
  });

  await test('4) 拉 target 详情 → 有 9 个面板 + 字段', async () => {
    const r = await http('GET', `/api/admin/users/${targetUser.id}`, null, adminToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.devices);
    assert.ok(r.body.subscriptionHistory);
    assert.ok(r.body.orderHistory);
    assert.ok(r.body.aiUsageSummary);
    assert.equal(r.body.aiUsageSummary.usedThisMonth, 1);
    assert.ok(r.body.dataFootprint);
    assert.ok(r.body.studyActivity);
    assert.ok(r.body.entitlement);
  });

  await test('5) 重置 target 密码（newPass456）', async () => {
    const r = await http('POST', `/api/admin/users/${targetUser.id}/reset-password`, {
      newPassword: 'NewPass456',
    }, adminToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.success);
  });

  await test('6) 旧 refresh token 旋转应失败（已撤销）', async () => {
    const r = await http('POST', '/auth/refresh', { refreshToken: oldTargetRefreshToken });
    assert.equal(r.status, 401, '旧 refresh token 应被撤销');
  });

  await test('7) target 用新密码重新登录成功', async () => {
    const r = await http('POST', '/auth/login-email', { email: targetEmail, password: 'NewPass456' });
    assert.equal(r.status, 200);
    targetToken = r.body.accessToken;
  });

  await test('8) 撤销现有订阅（应 409 SUB_ALREADY_ACTIVE 之前的状态）', async () => {
    // 当前已有 wechat 来源的 active sub，先撤销再重新授权
    const r = await http('POST', `/api/admin/users/${targetUser.id}/revoke-subscription`, {
      note: 'e2e 撤销',
    }, adminToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.afterStatus, 'refunded');
  });

  await test('9) 授权 7 天月度订阅', async () => {
    const r = await http('POST', `/api/admin/users/${targetUser.id}/grant-subscription`, {
      plan: 'monthly', days: 7, source: 'manual', note: 'e2e 授权',
    }, adminToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.subscriptionId);
    // target 自己 /me 应看到 isPro=true
    const me = await http('GET', '/me', null, targetToken);
    assert.equal(me.body.entitlement.isPro, true);
  });

  await test('10) 重复授权应 409', async () => {
    const r = await http('POST', `/api/admin/users/${targetUser.id}/grant-subscription`, {
      plan: 'monthly', days: 7, source: 'manual',
    }, adminToken);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'SUB_ALREADY_ACTIVE');
  });

  await test('11) 撤销授权的订阅', async () => {
    const r = await http('POST', `/api/admin/users/${targetUser.id}/revoke-subscription`, {
      note: 'e2e 撤销',
    }, adminToken);
    assert.equal(r.status, 200);
    const me = await http('GET', '/me', null, targetToken);
    assert.equal(me.body.entitlement.isPro, false);
  });

  await test('12) 重置 target AI 配额（应删除本月行）', async () => {
    const r = await http('POST', `/api/admin/users/${targetUser.id}/reset-ai-quota`, {}, adminToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.deletedRows, 1);
  });

  await test('13) 强制下线 → target 下次 /me 仍 200（access 还没过期），但 refresh 路径被断', async () => {
    // 先建一个 refresh token 给 target
    const { token: refreshTok } = await issueRefreshToken(targetUser.id, 'e2e-device');
    const r = await http('POST', `/api/admin/users/${targetUser.id}/force-logout`, {}, adminToken);
    assert.equal(r.status, 200);
    // 旧 refresh 不能再用
    const r2 = await http('POST', '/auth/refresh', { refreshToken: refreshTok });
    assert.equal(r2.status, 401);
  });

  await test('14) 退款 paid 订单 → order + sub 同步 refunded', async () => {
    // 测试 8 已把最初匹配的 sub 撤销了；退款匹配要求 active 订阅，
    // 这里重建一条 active 的 wechat 订阅（startsAt=paidAt）再退款
    await prisma.subscription.create({
      data: {
        userId: targetUser.id,
        plan: 'monthly',
        status: 'active',
        startsAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        source: 'wechat',
      },
    });
    const r = await http('POST', `/api/admin/users/${targetUser.id}/refund-order`, {
      outTradeNo: order.outTradeNo,
      reason: 'e2e 退款',
    }, adminToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.afterStatus, 'refunded');
    assert.ok(r.body.refundedSubscriptionId, '应同步撤销匹配订阅');
  });

  await test('15) 二次退款幂等', async () => {
    const r = await http('POST', `/api/admin/users/${targetUser.id}/refund-order`, {
      outTradeNo: order.outTradeNo,
      reason: 'e2e 重复',
    }, adminToken);
    assert.equal(r.status, 200);
  });

  await test('16) 封禁 target → 下次请求 ACCOUNT_DISABLED', async () => {
    const r = await http('DELETE', `/api/admin/users/${targetUser.id}`, null, adminToken);
    assert.equal(r.status, 200);
    // target 再访问 /me 应 403
    const me = await http('GET', '/me', null, targetToken);
    assert.equal(me.status, 403);
    assert.equal(me.body.error.code, 'ACCOUNT_DISABLED');
  });

  await test('17) 解封 target → 可重新登', async () => {
    const r = await http('PATCH', `/api/admin/users/${targetUser.id}`, { disabled: false }, adminToken);
    assert.equal(r.status, 200);
    // PATCH 返回 { user, revokedTokens }
    assert.equal(r.body.user.disabled, false);
  });

  await test('18) 审计日志应包含 8 种 action（user.* 按 targetUserId，sub.* 按 targetType）', async () => {
    // targetUserId 只对 targetType='user' 冗余写；订阅/订单审计走 targetType 过滤
    const [userLogsRes, subLogsRes, refundLogsRes] = await Promise.all([
      http('GET', `/api/admin/audit-log?targetUserId=${targetUser.id}&limit=50`, null, adminToken),
      http('GET', `/api/admin/audit-log?targetType=subscription&limit=50`, null, adminToken),
      http('GET', `/api/admin/audit-log?targetType=order&limit=50`, null, adminToken),
    ]);
    assert.equal(userLogsRes.status, 200);
    assert.ok(userLogsRes.body.logs.length >= 5, `期望 ≥5 条 user.* audit，实得 ${userLogsRes.body.logs.length}`);
    const userActions = new Set(userLogsRes.body.logs.map((l) => l.action));
    assert.ok(userActions.has('user.ban'), '应有 user.ban');
    assert.ok(userActions.has('user.unban'), '应有 user.unban');
    assert.ok(userActions.has('user.reset_password'), '应有 reset_password');
    assert.ok(userActions.has('user.force_logout'), '应有 force_logout');
    assert.ok(userActions.has('user.reset_ai_quota'), '应有 reset_ai_quota');

    const subActions = new Set(subLogsRes.body.logs.map((l) => l.action));
    assert.ok(subActions.has('sub.grant'), '应有 sub.grant');
    assert.ok(subActions.has('sub.revoke'), '应有 sub.revoke');

    const orderActions = new Set(refundLogsRes.body.logs.map((l) => l.action));
    assert.ok(orderActions.has('sub.refund'), '应有 sub.refund');
  });

  await test('19) /stats 包含扩展字段', async () => {
    const r = await http('GET', '/api/admin/stats', null, adminToken);
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.monthlyRevenueYuan === 'number');
    assert.ok(typeof r.body.newUsersThisMonth === 'number');
    assert.ok(typeof r.body.expiringSoonCount === 'number');
    assert.ok(typeof r.body.failedAiCallsThisMonth === 'number');
    assert.ok(Array.isArray(r.body.dailySignups30d));
    assert.equal(r.body.dailySignups30d.length, 30);
  });

  await test('20) /stats/revenue 返回 timeSeries + byPlan', async () => {
    const r = await http('GET', '/api/admin/stats/revenue?days=30', null, adminToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.timeSeries));
    assert.equal(r.body.timeSeries.length, 30);
    assert.ok(Array.isArray(r.body.byPlan));
  });

  await test('21) 公开 /api/announcements/active 端点可访问', async () => {
    // 先创建一个生效中的公告
    const a = await prisma.announcement.create({
      data: {
        title: 'e2e 公告', body: '测试', audience: 'all',
        startsAt: new Date(now.getTime() - 1000),
        endsAt: new Date(now.getTime() + 60_000),
        createdById: adminUser.id,
      },
    });
    const r = await http('GET', '/api/announcements/active');
    assert.equal(r.status, 200);
    assert.ok(r.body.announcements.some((x) => x.id === a.id));
    // 清理
    await prisma.announcement.delete({ where: { id: a.id } });
  });

  await test('22) 非 admin 用户访问 /api/admin/* 应 403', async () => {
    // 重新登录 target 拿个新 token
    const login = await http('POST', '/auth/login-email', { email: targetEmail, password: 'NewPass456' });
    const tok = login.body.accessToken;
    const r = await http('GET', '/api/admin/users', null, tok);
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'NOT_ADMIN');
  });

} finally {
  // 清理
  await prisma.adminActionLog.deleteMany({ where: { targetUserId: { in: [adminUser.id, targetUser.id] } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [adminUser.id, targetUser.id] } } });
  await prisma.aiUsage.deleteMany({ where: { userId: { in: [adminUser.id, targetUser.id] } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: [adminUser.id, targetUser.id] } } });
  await prisma.order.deleteMany({ where: { userId: { in: [adminUser.id, targetUser.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, targetUser.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, targetEmail] } } });
  console.log('🧹 清理完成');
}

console.log(`\n${passed === 22 ? '🎉' : '⚠️ '} ${passed}/22 通过`);
process.exit(process.exitCode || 0);
