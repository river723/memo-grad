/**
 * 初始化脚本：给特定手机号授予 admin 角色。
 *
 * 用法：
 *   DATABASE_URL=... node scripts/seed-admin.js <phone>
 *
 * 示例（在 server/ 目录下）：
 *   npx tsx scripts/seed-admin.js 13900001234
 *
 * 注意：这只设置 role，账号必须已经存在（通过 /auth/login 创建）。
 */

import { PrismaClient } from '@prisma/client';

const client = new PrismaClient();

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('用法: npx tsx scripts/seed-admin.js <phone>');
    process.exit(1);
  }

  const user = await client.user.updateMany({
    where: { phone },
    data: { role: 'admin' },
  });

  if (user.count === 0) {
    console.error(`未找到手机号 ${phone}，请先通过 /auth/login 创建账号`);
    process.exit(1);
  }

  console.log(`✅ 已将 ${phone} 提升为 admin 角色`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => client.$disconnect());
