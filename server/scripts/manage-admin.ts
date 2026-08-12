/**
 * 救援工具：列出/提升/降级管理员角色，必要时一并解封。
 *
 * 这是 LAST_ADMIN 守卫之外的逃生通道：当所有 admin 都被降级或封禁，
 * HTTP 端点拒绝任何操作，必须直连 DB 才能恢复。
 *
 * 用法（在 server/ 目录下）：
 *   npx tsx scripts/manage-admin.ts list
 *   npx tsx scripts/manage-admin.ts promote <phone|email>
 *   npx tsx scripts/manage-admin.ts demote <phone|email>
 *   npx tsx scripts/manage-admin.ts unblock <phone|email>
 *   npx tsx scripts/manage-admin.ts rescue <phone|email>   # promote + unblock 一起做
 *
 * 行为约定：
 *   - 通过 phone 或 email 唯一定位用户
 *   - 不修改 createdAt / 不写审计日志（这是 CLI 救援，不走 admin API）
 *   - 操作前打印当前状态，操作后打印新状态，便于人工核对
 */

import { PrismaClient } from '@prisma/client';

const client = new PrismaClient();

type Role = 'admin' | 'user';

async function findUser(identifier: string) {
  // 不区分大小写地按 email 或 phone 查
  return client.user.findFirst({
    where: {
      OR: [
        { phone: identifier },
        { email: { equals: identifier, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      phone: true,
      email: true,
      nickname: true,
      role: true,
      disabled: true,
      disabledAt: true,
      disabledReason: true,
    },
  });
}

function printState(user: { phone: string | null; email: string | null; role: string; disabled: boolean; disabledReason: string | null; disabledAt: Date | null }) {
  const id = user.phone ?? user.email ?? '(无标识)';
  const tag = user.disabled ? '🔒 封禁' : '✅ 正常';
  console.log(`  ${id}  role=${user.role}  ${tag}${user.disabledReason ? `  (${user.disabledReason})` : ''}`);
  if (user.disabledAt) console.log(`     封禁时间: ${user.disabledAt.toISOString()}`);
}

async function cmdList() {
  const admins = await client.user.findMany({
    where: { role: 'admin' },
    select: { id: true, phone: true, email: true, role: true, disabled: true, disabledAt: true, disabledReason: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admins.length === 0) {
    console.log('⚠️  当前没有任何 admin 账号！请运行 promote <phone> 创建第一个');
    return;
  }
  console.log(`当前 ${admins.length} 个 admin 账号：`);
  for (const a of admins) printState(a);
}

async function cmdPromote(identifier: string) {
  const before = await findUser(identifier);
  if (!before) {
    console.error(`❌ 未找到 ${identifier}`);
    process.exit(1);
  }
  printState(before);
  if (before.role === 'admin') {
    console.log('  已经是 admin，跳过');
    return;
  }
  await client.user.update({ where: { id: before.id }, data: { role: 'admin' } });
  console.log(`  ✅ 已提升为 admin`);
}

async function cmdDemote(identifier: string) {
  const before = await findUser(identifier);
  if (!before) {
    console.error(`❌ 未找到 ${identifier}`);
    process.exit(1);
  }
  printState(before);
  if (before.role !== 'admin') {
    console.log('  已经是 user，跳过');
    return;
  }
  const adminCount = await client.user.count({ where: { role: 'admin' } });
  if (adminCount <= 1) {
    console.error('❌ 这是唯一的 admin 账号，无法降级（避免锁死）。先 promote 另一个账号再降级这个');
    process.exit(1);
  }
  await client.user.update({ where: { id: before.id }, data: { role: 'user' } });
  console.log('  ✅ 已降级为 user');
}

async function cmdUnblock(identifier: string) {
  const before = await findUser(identifier);
  if (!before) {
    console.error(`❌ 未找到 ${identifier}`);
    process.exit(1);
  }
  printState(before);
  if (!before.disabled) {
    console.log('  账号未被封禁，跳过');
    return;
  }
  await client.user.update({
    where: { id: before.id },
    data: { disabled: false, disabledAt: null, disabledReason: null, disabledById: null },
  });
  console.log('  ✅ 已解封');
}

async function cmdRescue(identifier: string) {
  await cmdUnblock(identifier);
  await cmdPromote(identifier);
  console.log('  🎉 rescue 完成：账号已解封并提升为 admin');
}

async function main() {
  const cmd = process.argv[2];
  const identifier = process.argv[3];
  if (!cmd) {
    console.error('用法: npx tsx scripts/manage-admin.ts <list|promote|demote|unblock|rescue> [phone|email]');
    process.exit(1);
  }
  if (cmd !== 'list' && !identifier) {
    console.error(`用法: npx tsx scripts/manage-admin.ts ${cmd} <phone|email>`);
    process.exit(1);
  }
  switch (cmd) {
    case 'list': return cmdList();
    case 'promote': return cmdPromote(identifier!);
    case 'demote': return cmdDemote(identifier!);
    case 'unblock': return cmdUnblock(identifier!);
    case 'rescue': return cmdRescue(identifier!);
    default:
      console.error(`未知命令: ${cmd}`);
      process.exit(1);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => client.$disconnect());
