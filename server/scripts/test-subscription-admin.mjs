/**
 * subscriptionAdmin 集成测试。
 *
 * 用法：cd server && node --import tsx scripts/test-subscription-admin.mjs
 * 前置：DATABASE_URL 可达
 *
 * 覆盖：
 *   1) grantSubscription: 给无订阅用户授权 7 天月度
 *   2) grantSubscription: 已有 active 订阅时 409 SUB_ALREADY_ACTIVE
 *   3) grantSubscription: 已有 expired 订阅时仍可授权（视为历史）
 *   4) grantSubscription: 参数校验失败
 *   5) revokeSubscription: 撤销有效订阅 → status=refunded
 *   6) revokeSubscription: 没有有效订阅时 404 SUB_NOT_FOUND
 *   7) grant→revoke 完整闭环：撤后能再 grant
 *   8) 审计日志正确记录 grant / revoke
 *   9) getEntitlement 反映最新状态
 */

import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const { grantSubscription, revokeSubscription } = await import('../src/services/subscriptionAdmin.ts');
const { getEntitlement } = await import('../src/services/subscriptionService.ts');

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
const adminUser = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}0`, role: 'admin' } });
const target = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}1` } });

try {

  await test('grantSubscription: 给无订阅用户授权 7 天月度', async () => {
    const r = await grantSubscription(undefined, adminUser.id, target.id, {
      plan: 'monthly', days: 7, source: 'gift', note: '补偿测试',
    });
    assert.ok(r.subscriptionId);
    assert.ok(r.expiresAt > new Date());
    assert.equal(r.expiresAt.getTime() - r.startsAt.getTime(), 7 * 24 * 3600 * 1000);

    const sub = await prisma.subscription.findUnique({ where: { id: r.subscriptionId } });
    assert.equal(sub.status, 'active');
    assert.equal(sub.source, 'gift');
    assert.equal(sub.plan, 'monthly');

    const ent = await getEntitlement(target.id);
    assert.equal(ent.isPro, true);
    assert.equal(ent.plan, 'monthly');
  });

  await test('grantSubscription: 已有 active 订阅时 409', async () => {
    let threw = false;
    try {
      await grantSubscription(undefined, adminUser.id, target.id, {
        plan: 'monthly', days: 30, source: 'manual',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'SUB_ALREADY_ACTIVE');
      assert.equal(e.statusCode, 409);
      assert.ok(e.details.existingSubscriptionId);
    }
    assert.equal(threw, true);
  });

  await test('grantSubscription: 撤销后能再 grant', async () => {
    await revokeSubscription(undefined, adminUser.id, target.id, { note: '测试撤销' });
    const r = await grantSubscription(undefined, adminUser.id, target.id, {
      plan: 'yearly', days: 365, source: 'manual',
    });
    assert.ok(r.subscriptionId);
    const ent = await getEntitlement(target.id);
    assert.equal(ent.isPro, true);
    assert.equal(ent.plan, 'yearly');
  });

  await test('grantSubscription: 已有 expired 订阅时仍可授权', async () => {
    // 手动建一条 expired 的历史订阅
    const past = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const furtherPast = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    await prisma.subscription.create({
      data: {
        userId: target.id,
        plan: 'monthly',
        status: 'expired',
        startsAt: furtherPast,
        expiresAt: past,
        source: 'wechat',
      },
    });

    // 撤销当前的 active 以便可测试
    await revokeSubscription(undefined, adminUser.id, target.id, {});

    // 现在只有 expired 订阅
    const r = await grantSubscription(undefined, adminUser.id, target.id, {
      plan: 'quarterly', days: 30, source: 'gift',
    });
    assert.ok(r.subscriptionId);
  });

  await test('grantSubscription: 参数校验失败', async () => {
    let threw = false;
    try {
      await grantSubscription(undefined, adminUser.id, target.id, {
        plan: 'invalid-plan', days: 7, source: 'gift',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.statusCode, 400);
    }
    assert.equal(threw, true);

    threw = false;
    try {
      await grantSubscription(undefined, adminUser.id, target.id, {
        plan: 'monthly', days: -1, source: 'gift',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.statusCode, 400);
    }
    assert.equal(threw, true);

    threw = false;
    try {
      await grantSubscription(undefined, adminUser.id, target.id, {
        plan: 'monthly', days: 7, source: 'wechat',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.statusCode, 400);
    }
    assert.equal(threw, true);
  });

  await test('revokeSubscription: 撤销有效订阅 → status=refunded', async () => {
    // 准备：建一个新用户
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}2` } });
    await grantSubscription(undefined, adminUser.id, u.id, {
      plan: 'monthly', days: 30, source: 'gift',
    });

    const r = await revokeSubscription(undefined, adminUser.id, u.id, { note: '试用不通过' });
    assert.equal(r.beforeStatus, 'active');
    assert.equal(r.afterStatus, 'refunded');

    const sub = await prisma.subscription.findUnique({ where: { id: r.subscriptionId } });
    assert.equal(sub.status, 'refunded');

    const ent = await getEntitlement(u.id);
    assert.equal(ent.isPro, false);

    await prisma.user.delete({ where: { id: u.id } });
  });

  await test('revokeSubscription: 没有有效订阅时 404', async () => {
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}3` } });
    let threw = false;
    try {
      await revokeSubscription(undefined, adminUser.id, u.id, {});
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'SUB_NOT_FOUND');
    }
    assert.equal(threw, true);
    await prisma.user.delete({ where: { id: u.id } });
  });

  await test('grantSubscription: 用户不存在 404', async () => {
    let threw = false;
    try {
      await grantSubscription(undefined, adminUser.id, 'non-existent-id-xxxxxx', {
        plan: 'monthly', days: 7, source: 'gift',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'USER_NOT_FOUND');
    }
    assert.equal(threw, true);
  });

  await test('审计: grant + revoke 各写一条', async () => {
    const u = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}4` } });
    const grant = await grantSubscription(undefined, adminUser.id, u.id, {
      plan: 'monthly', days: 30, source: 'manual', note: '审计测试',
    });
    await revokeSubscription(undefined, adminUser.id, u.id, {});

    // sub.* 审计的 targetType='subscription'，targetUserId 为 null（只有 targetType='user' 才冗余写）
    const audits = await prisma.adminActionLog.findMany({
      where: { adminUserId: adminUser.id, action: { in: ['sub.grant', 'sub.revoke'] }, targetId: grant.subscriptionId },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(audits.length, 2);
    assert.equal(audits[0].action, 'sub.grant');
    assert.equal(audits[0].targetType, 'subscription');
    assert.equal(audits[0].targetId, grant.subscriptionId);
    assert.equal(audits[0].note, '审计测试');
    assert.equal(audits[1].action, 'sub.revoke');

    await prisma.user.delete({ where: { id: u.id } });
  });

} finally {
  // 清理
  const cleanupIds = [adminUser.id, target.id];
  await prisma.adminActionLog.deleteMany({ where: { targetUserId: { in: cleanupIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: cleanupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupIds } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `1390000${String(ts).slice(-5)}` } } });
  console.log('🧹 清理完成');
}

console.log(`\n${passed === 9 ? '🎉' : '⚠️ '} ${passed}/9 通过`);
process.exit(process.exitCode || 0);
