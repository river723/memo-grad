/**
 * 公告集成测试。
 *
 * 用法：cd server && node --import tsx scripts/test-announcements.mjs
 * 前置：DATABASE_URL 可达
 *
 * 覆盖：
 *   1) listActiveAnnouncements: 时间窗内 all 公告被返回
 *   2) listActiveAnnouncements: 未到 startsAt / 已过 endsAt 不返回
 *   3) listActiveAnnouncements: 非 Pro 用户看不到 audience='pro'
 *   4) listActiveAnnouncements: Pro 用户同时看到 all + pro
 *   5) createAnnouncement: 写入数据库 + 审计
 *   6) createAnnouncement: endsAt <= startsAt → 400
 *   7) listAnnouncements: 管理员列表 + audience 筛选
 *   8) deleteAnnouncement: 真删 + 审计
 *   9) deleteAnnouncement: 不存在 → 404
 *  10) listActiveAnnouncements: startsAt DESC 排序
 */

import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.error('❌ 需要 DATABASE_URL');
  process.exit(1);
}

const { prisma } = await import('../src/db.ts');
const {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  listActiveAnnouncements,
} = await import('../src/services/announcementService.ts');

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

// ---- 准备：admin + 几条公告 ----
const adminUser = await prisma.user.create({ data: { phone: `1390000${String(ts).slice(-5)}0`, role: 'admin' } });

const now = new Date();
const oneDayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
const oneDayLater = new Date(now.getTime() + 24 * 3600 * 1000);
const oneHourLater = new Date(now.getTime() + 3600 * 1000);
const inOneHour = new Date(now.getTime() + 3600 * 1000);
const inTwoDays = new Date(now.getTime() + 2 * 24 * 3600 * 1000);

// 当前生效的 all 公告
const activeAll = await prisma.announcement.create({
  data: {
    title: '系统维护通知',
    body: '今晚 22:00 - 23:00 维护',
    audience: 'all',
    startsAt: oneDayAgo,
    endsAt: oneDayLater,
    createdById: adminUser.id,
  },
});
// 当前生效的 pro 公告
const activePro = await prisma.announcement.create({
  data: {
    title: 'Pro 用户专属活动',
    body: 'Pro 优惠',
    audience: 'pro',
    startsAt: oneDayAgo,
    endsAt: oneDayLater,
    createdById: adminUser.id,
  },
});
// 未来才开始的公告
const futureAll = await prisma.announcement.create({
  data: {
    title: '未来的公告',
    body: '还没开始',
    audience: 'all',
    startsAt: inOneHour,
    endsAt: inTwoDays,
    createdById: adminUser.id,
  },
});
// 已过期的公告
const expiredAll = await prisma.announcement.create({
  data: {
    title: '过期公告',
    body: '已过期',
    audience: 'all',
    startsAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
    endsAt: oneDayAgo,
    createdById: adminUser.id,
  },
});

try {

  await test('listActiveAnnouncements: 非 Pro 默认只看 audience=all', async () => {
    const list = await listActiveAnnouncements('all', false);
    const ids = list.map((a) => a.id);
    assert.ok(ids.includes(activeAll.id), '应包含 all 公告');
    assert.ok(!ids.includes(activePro.id), '不应包含 pro 公告');
    assert.ok(!ids.includes(futureAll.id), '不应包含未来公告');
    assert.ok(!ids.includes(expiredAll.id), '不应包含过期公告');
  });

  await test('listActiveAnnouncements: Pro 用户同时看 all + pro', async () => {
    const list = await listActiveAnnouncements('all', true);
    const ids = list.map((a) => a.id);
    assert.ok(ids.includes(activeAll.id));
    assert.ok(ids.includes(activePro.id));
  });

  await test('listActiveAnnouncements: startsAt DESC 排序', async () => {
    const list = await listActiveAnnouncements('all', true);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1].startsAt.getTime() >= list[i].startsAt.getTime(), '应按 startsAt DESC');
    }
  });

  await test('createAnnouncement: 写入数据库 + 审计', async () => {
    const r = await createAnnouncement(undefined, adminUser.id, {
      title: '测试公告',
      body: '测试内容',
      audience: 'all',
      startsAt: oneDayAgo,
      endsAt: oneDayLater,
    });
    assert.ok(r.id);

    const audit = await prisma.adminActionLog.findFirst({
      where: { adminUserId: adminUser.id, targetId: r.id, action: 'announcement.create' },
    });
    assert.ok(audit);
    assert.equal(audit.targetType, 'announcement');
    assert.match(audit.note, /测试公告/);

    // 清理
    await prisma.announcement.delete({ where: { id: r.id } });
    await prisma.adminActionLog.delete({ where: { id: audit.id } });
  });

  await test('createAnnouncement: endsAt <= startsAt → 400', async () => {
    let threw = false;
    try {
      await createAnnouncement(undefined, adminUser.id, {
        title: 't', body: 'b', audience: 'all',
        startsAt: oneDayLater, endsAt: oneDayAgo,
      });
    } catch (e) {
      threw = true;
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, 'INVALID_PARAMS');
    }
    assert.equal(threw, true);
  });

  await test('listAnnouncements: 管理员列表包含全部（含过期/未来）', async () => {
    const r = await listAnnouncements({ limit: 100 });
    const ids = r.announcements.map((a) => a.id);
    assert.ok(ids.includes(activeAll.id));
    assert.ok(ids.includes(futureAll.id));
    assert.ok(ids.includes(expiredAll.id));
  });

  await test('listAnnouncements: audience=pro 筛选只返回 pro', async () => {
    const r = await listAnnouncements({ audience: 'pro', limit: 100 });
    assert.ok(r.announcements.every((a) => a.audience === 'pro'));
    assert.ok(r.announcements.some((a) => a.id === activePro.id));
  });

  await test('deleteAnnouncement: 真删 + 审计', async () => {
    const a = await prisma.announcement.create({
      data: {
        title: '待删', body: 'x', audience: 'all',
        startsAt: oneDayAgo, endsAt: oneDayLater, createdById: adminUser.id,
      },
    });

    await deleteAnnouncement(undefined, adminUser.id, a.id);

    const found = await prisma.announcement.findUnique({ where: { id: a.id } });
    assert.equal(found, null, '应被硬删');

    const audit = await prisma.adminActionLog.findFirst({
      where: { adminUserId: adminUser.id, targetId: a.id, action: 'announcement.delete' },
    });
    assert.ok(audit);
  });

  await test('deleteAnnouncement: 不存在 → 404', async () => {
    let threw = false;
    try {
      await deleteAnnouncement(undefined, adminUser.id, 'non-existent-id-xxxx');
    } catch (e) {
      threw = true;
      assert.equal(e.code, 'ANNOUNCEMENT_NOT_FOUND');
    }
    assert.equal(threw, true);
  });

} finally {
  // 清理
  await prisma.adminActionLog.deleteMany({ where: { adminUserId: adminUser.id } });
  await prisma.announcement.deleteMany({ where: { createdById: adminUser.id } });
  await prisma.user.delete({ where: { id: adminUser.id } });
  console.log('🧹 清理完成');
}

console.log(`\n${passed === 9 ? '🎉' : '⚠️ '} ${passed}/9 通过`);
process.exit(process.exitCode || 0);
