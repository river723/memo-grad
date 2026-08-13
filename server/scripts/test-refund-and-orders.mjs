/**
 * 退款 + 订单列表集成测试。
 *
 * 用法：cd server && node --import tsx scripts/test-refund-and-orders.mjs
 * 前置：DATABASE_URL 可达
 *
 * 覆盖：
 *   1) refundOrder: paid 订单退款 → order + matching sub 同步 refunded
 *   2) refundOrder: 找不到匹配订阅时仍退款订单，返回 warning
 *   3) refundOrder: 二次退款幂等
 *   4) refundOrder: pending/closed 订单不可退
 *   5) refundOrder: 订单不属于 userId 时 403
 *   6) refundOrder: 原因空 → 400
 *   7) listOrders: 基本分页
 *   8) listOrders: status 筛选
 *   9) listOrders: channel 筛选
 *  10) listOrders: search 按 phone 命中
 */

import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const { refundOrder } = await import('../src/services/subscriptionAdmin.ts');
const { listOrders } = await import('../src/services/adminQueries.ts');

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

// ---- 准备：建 admin、3 个目标用户、几条订单 ----
const adminUser = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}0`, role: 'admin' } });
const u1 = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}1`, email: `t1-${ts}@test.com` } });
const u2 = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}2` } });
const u3 = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}3` } });

const now = new Date();
const order1 = await prisma.order.create({
  data: {
    userId: u1.id,
    outTradeNo: `otn-${ts}-1`,
    transactionId: `txn-${ts}-1`,
    channel: 'wechat',
    plan: 'monthly',
    amountFen: 1990,
    status: 'paid',
    paidAt: now,
  },
});
const matchingSub = await prisma.subscription.create({
  data: {
    userId: u1.id,
    plan: 'monthly',
    status: 'active',
    startsAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    source: 'wechat',
  },
});
const order2 = await prisma.order.create({
  data: {
    userId: u2.id,
    outTradeNo: `otn-${ts}-2`,
    transactionId: `txn-${ts}-2`,
    channel: 'alipay',
    plan: 'yearly',
    amountFen: 14900,
    status: 'paid',
    paidAt: now,
  },
});
// u2 故意不建匹配订阅（测 warning 路径）
const order3 = await prisma.order.create({
  data: {
    userId: u3.id,
    outTradeNo: `otn-${ts}-3`,
    channel: 'wechat',
    plan: 'quarterly',
    amountFen: 4990,
    status: 'pending',
  },
});
const order4 = await prisma.order.create({
  data: {
    userId: u3.id,
    outTradeNo: `otn-${ts}-4`,
    channel: 'wechat',
    plan: 'monthly',
    amountFen: 1990,
    status: 'closed',
  },
});

try {

  // ==================== refundOrder ====================
  await test('refundOrder: paid 订单退款 → order + matching sub 同步 refunded', async () => {
    const r = await refundOrder(undefined, adminUser.id, u1.id, {
      outTradeNo: order1.outTradeNo,
      reason: '客户投诉',
    });
    assert.equal(r.beforeStatus, 'paid');
    assert.equal(r.afterStatus, 'refunded');
    assert.equal(r.refundedSubscriptionId, matchingSub.id, '应同步撤销匹配订阅');
    assert.equal(r.warning, null);

    const o = await prisma.order.findUnique({ where: { id: order1.id } });
    assert.equal(o.status, 'refunded');
    const s = await prisma.subscription.findUnique({ where: { id: matchingSub.id } });
    assert.equal(s.status, 'refunded');
  });

  await test('refundOrder: 找不到匹配订阅时仍退款订单，返回 warning', async () => {
    const r = await refundOrder(undefined, adminUser.id, u2.id, {
      outTradeNo: order2.outTradeNo,
      reason: '服务故障',
    });
    assert.equal(r.afterStatus, 'refunded');
    assert.equal(r.refundedSubscriptionId, null);
    assert.ok(r.warning, '应有 warning');
    assert.match(r.warning, /未找到匹配/);
  });

  await test('refundOrder: 二次退款幂等', async () => {
    const r = await refundOrder(undefined, adminUser.id, u1.id, {
      outTradeNo: order1.outTradeNo,
      reason: '再次尝试',
    });
    assert.equal(r.afterStatus, 'refunded');
    assert.match(r.warning || '', /已退款/);
  });

  await test('refundOrder: pending 订单不可退', async () => {
    let threw = false;
    try {
      await refundOrder(undefined, adminUser.id, u3.id, {
        outTradeNo: order3.outTradeNo,
        reason: '测试',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'ORDER_NOT_REFUNDABLE');
    }
    assert.equal(threw, true);
  });

  await test('refundOrder: closed 订单不可退', async () => {
    let threw = false;
    try {
      await refundOrder(undefined, adminUser.id, u3.id, {
        outTradeNo: order4.outTradeNo,
        reason: '测试',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'ORDER_NOT_REFUNDABLE');
    }
    assert.equal(threw, true);
  });

  await test('refundOrder: 订单不属于 userId 时 403', async () => {
    let threw = false;
    try {
      await refundOrder(undefined, adminUser.id, u2.id, {
        outTradeNo: order1.outTradeNo, // u1 的订单
        reason: '测试越权',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'ORDER_NOT_OWNED');
    }
    assert.equal(threw, true);
  });

  await test('refundOrder: 原因空 → 400', async () => {
    let threw = false;
    try {
      await refundOrder(undefined, adminUser.id, u2.id, {
        outTradeNo: order2.outTradeNo,
        reason: '',
      });
    } catch (e) {
      threw = true;
      assert.equal(e.statusCode, 400);
    }
    assert.equal(threw, true);
  });

  // ==================== listOrders ====================
  await test('listOrders: 基本分页 — 应能查到所有 4 条', async () => {
    const r = await listOrders({ limit: 100 });
    const ids = r.orders.map((o) => o.id);
    assert.ok(ids.includes(order1.id));
    assert.ok(ids.includes(order2.id));
    assert.ok(ids.includes(order3.id));
    assert.ok(ids.includes(order4.id));
  });

  await test('listOrders: status=refunded 筛选', async () => {
    const r = await listOrders({ status: 'refunded', limit: 100 });
    assert.ok(r.orders.every((o) => o.status === 'refunded'));
    assert.ok(r.orders.some((o) => o.id === order1.id));
    assert.ok(r.orders.some((o) => o.id === order2.id));
  });

  await test('listOrders: channel=wechat 筛选', async () => {
    const r = await listOrders({ channel: 'wechat', limit: 100 });
    assert.ok(r.orders.every((o) => o.channel === 'wechat'));
    assert.ok(r.orders.some((o) => o.id === order1.id));
  });

  await test('listOrders: search 按 phone 命中（u1 的 order1）', async () => {
    const r = await listOrders({ search: u1.phone.slice(-5), limit: 100 });
    assert.equal(r.orders.length, 1);
    assert.equal(r.orders[0].id, order1.id);
    assert.equal(r.orders[0].userPhone, u1.phone);
  });

  await test('refundOrder: 审计写一条（action=sub.refund, targetType=order）', async () => {
    const audit = await prisma.adminActionLog.findFirst({
      where: { adminUserId: adminUser.id, targetType: 'order', targetId: order1.id, action: 'sub.refund' },
    });
    assert.ok(audit);
    assert.match(audit.note, /客户投诉/);
  });

} finally {
  // 清理
  const allIds = [adminUser.id, u1.id, u2.id, u3.id];
  await prisma.adminActionLog.deleteMany({ where: { targetUserId: { in: allIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.order.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `1390000${String(ts).slice(-5)}` } } });
  console.log('🧹 清理完成');
}

console.log(`\n${passed === 12 ? '🎉' : '⚠️ '} ${passed}/12 通过`);
process.exit(process.exitCode || 0);
