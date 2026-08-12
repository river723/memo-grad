/**
 * 密码哈希工具。从 auth.ts:57-70 抽出，便于 adminRoutes 复用。
 *
 * 算法：scrypt（Node 内置），格式 `scrypt$<salt-hex>$<hash-hex>`。
 * 为什么不用 bcrypt/argon2：scrypt 也是内存硬型 KDF，自带随机盐；Node 内置意味着
 * 零依赖，迁移到 Serverless 不会被 native binding 卡住。
 *
 * 格式保留 `$` 分隔是为了将来换算法（比如迁 argon2）时能识别旧哈希：
 * 启动时扫库若发现 `scrypt$...` 占比仍高，就走 verifyPassword；
 * 占比低就强制用户下次登录时升级到新格式。
 */

import crypto from 'node:crypto';

const SCRYPT_KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
