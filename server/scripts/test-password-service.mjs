/**
 * 密码服务单元测试。
 *
 * 不需要 DB，纯函数测试。
 * 用法：cd server && node --import tsx scripts/test-password-service.mjs
 */

import assert from 'node:assert/strict';
const { hashPassword, verifyPassword } = await import('../src/services/passwordService.ts');

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

await test('hashPassword 生成 scrypt 格式', () => {
  const h = hashPassword('mypassword');
  assert.match(h, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
});

await test('verifyPassword 正确密码通过', () => {
  const h = hashPassword('mypassword');
  assert.equal(verifyPassword('mypassword', h), true);
});

await test('verifyPassword 错误密码拒绝', () => {
  const h = hashPassword('mypassword');
  assert.equal(verifyPassword('wrongpass', h), false);
});

await test('verifyPassword 旧格式 bcrypt 拒绝', () => {
  assert.equal(verifyPassword('x', '$2b$10$abcdefghijklmnopqrstuv'), false);
});

await test('verifyPassword 损坏字符串拒绝', () => {
  assert.equal(verifyPassword('x', 'scrypt$bad'), false);
  assert.equal(verifyPassword('x', 'notascrypt'), false);
  assert.equal(verifyPassword('x', ''), false);
});

await test('同密码两次哈希不同（盐随机）', () => {
  const a = hashPassword('same');
  const b = hashPassword('same');
  assert.notEqual(a, b);
  // 但都能验证通过
  assert.equal(verifyPassword('same', a), true);
  assert.equal(verifyPassword('same', b), true);
});

console.log(`\n${passed === 6 ? '🎉' : '⚠️ '} ${passed}/6 通过`);
process.exit(process.exitCode || 0);
