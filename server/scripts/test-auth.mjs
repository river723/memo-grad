/**
 * 阶段 1 验收：对真实运行的服务跑完整认证流程。
 *
 * 不是单元测试——它验证的正是"curl 能完成注册登录拿到 token，/me 返回
 * 用户与订阅状态"这个验收标准，并额外覆盖那些容易写错却不会立刻暴露的
 * 安全边界（refresh 轮换、token 类型混用、验证码一次性、账号枚举）。
 *
 * 用法：先 `npm run dev` 起服务，再 `npm run test:auth`
 */

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

let pass = 0;
let fail = 0;

function check(label, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 空响应体 */
  }
  return { status: res.status, body: json };
}

/** 每次运行用不同手机号，避免受上一轮的频率限制影响。 */
function randomPhone() {
  return `13${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
}

async function main() {
  console.log(`目标服务: ${BASE}\n`);

  // ---------- 健康检查 ----------
  console.log('[健康检查]');
  const health = await req('GET', '/health');
  check('GET /health 返回 200', health.status === 200, `实际 ${health.status}`);
  check('数据库可达 (status=ok)', health.body?.status === 'ok', JSON.stringify(health.body));
  if (health.body?.status !== 'ok') {
    console.error('\n数据库不可达，后续测试无意义。请先 npm run db:up');
    process.exit(1);
  }

  const phone = randomPhone();

  // ---------- 发送验证码 ----------
  console.log('\n[发送验证码]');
  const send = await req('POST', '/auth/send-code', { body: { phone } });
  check('返回 200', send.status === 200, JSON.stringify(send.body));
  check('sent=true', send.body?.sent === true);
  check('开发模式回显 devCode', typeof send.body?.devCode === 'string', JSON.stringify(send.body));
  check('devCode 是 6 位数字', /^\d{6}$/.test(send.body?.devCode || ''));
  const code = send.body?.devCode;

  // ---------- 冷却期防刷 ----------
  console.log('\n[冷却期防刷]');
  const resend = await req('POST', '/auth/send-code', { body: { phone } });
  check('立即重发被拒 (429)', resend.status === 429, `实际 ${resend.status}`);
  check('错误码 SMS_COOLDOWN', resend.body?.error?.code === 'SMS_COOLDOWN', JSON.stringify(resend.body));
  check('告知需等待秒数', typeof resend.body?.error?.details?.retryAfterSeconds === 'number');

  // ---------- 参数校验 ----------
  console.log('\n[参数校验]');
  const badPhone = await req('POST', '/auth/send-code', { body: { phone: '12345' } });
  check('非法手机号被拒 (400)', badPhone.status === 400, `实际 ${badPhone.status}`);
  check('错误码 VALIDATION_FAILED', badPhone.body?.error?.code === 'VALIDATION_FAILED');

  // ---------- 错误验证码 ----------
  console.log('\n[错误验证码]');
  const wrongCode = await req('POST', '/auth/login', {
    body: { phone, code: code === '000000' ? '111111' : '000000' },
  });
  check('错误验证码被拒 (400)', wrongCode.status === 400, `实际 ${wrongCode.status}`);
  check('错误码 CODE_INCORRECT', wrongCode.body?.error?.code === 'CODE_INCORRECT', JSON.stringify(wrongCode.body));

  // ---------- 首次登录即建号 ----------
  console.log('\n[首次登录建号]');
  const login = await req('POST', '/auth/login', {
    body: { phone, code, deviceId: 'test-device-1', platform: 'web', appVersion: '1.0.0' },
  });
  check('登录成功 (200)', login.status === 200, JSON.stringify(login.body));
  check('isNewUser=true（免注册建号）', login.body?.isNewUser === true);
  check('返回 accessToken', typeof login.body?.accessToken === 'string');
  check('返回 refreshToken', typeof login.body?.refreshToken === 'string');
  check('accessToken 是 JWT 三段式', (login.body?.accessToken || '').split('.').length === 3);
  check('返回用户手机号', login.body?.user?.phone === phone);
  check('新用户 isPro=false', login.body?.entitlement?.isPro === false, JSON.stringify(login.body?.entitlement));
  check('新用户 status=none', login.body?.entitlement?.status === 'none');
  check(
    '免费用户配额为 0（AI 完全锁）',
    login.body?.entitlement?.quota?.remaining === 0,
    JSON.stringify(login.body?.entitlement?.quota)
  );

  const accessToken = login.body?.accessToken;
  const refreshToken = login.body?.refreshToken;

  // ---------- 验证码一次性 ----------
  console.log('\n[验证码一次性]');
  const reuse = await req('POST', '/auth/login', { body: { phone, code } });
  check('同一验证码不能复用 (400)', reuse.status === 400, `实际 ${reuse.status}`);
  check(
    '错误码为 CODE_NOT_FOUND',
    reuse.body?.error?.code === 'CODE_NOT_FOUND',
    JSON.stringify(reuse.body)
  );

  // ---------- /me ----------
  console.log('\n[GET /me]');
  const me = await req('GET', '/me', { token: accessToken });
  check('带 token 返回 200', me.status === 200, JSON.stringify(me.body));
  check('返回同一用户', me.body?.user?.phone === phone);
  check('返回 entitlement', typeof me.body?.entitlement === 'object');
  check('entitlement 含配额明细', typeof me.body?.entitlement?.quota?.monthlyLimit === 'number');

  const noToken = await req('GET', '/me');
  check('无 token 被拒 (401)', noToken.status === 401, `实际 ${noToken.status}`);
  const badToken = await req('GET', '/me', { token: 'not-a-real-jwt' });
  check('伪造 token 被拒 (401)', badToken.status === 401, `实际 ${badToken.status}`);

  // ---------- refresh token 不能当 access token 用 ----------
  console.log('\n[令牌类型混用防护]');
  const misuse = await req('GET', '/me', { token: refreshToken });
  check(
    'refreshToken 不能当 accessToken 用 (401)',
    misuse.status === 401,
    `实际 ${misuse.status}`
  );

  // ---------- 刷新与轮换 ----------
  console.log('\n[刷新与轮换]');
  const refreshed = await req('POST', '/auth/refresh', { body: { refreshToken } });
  check('刷新成功 (200)', refreshed.status === 200, JSON.stringify(refreshed.body));
  check('返回新 accessToken', typeof refreshed.body?.accessToken === 'string');
  check('返回新 refreshToken', typeof refreshed.body?.refreshToken === 'string');
  check(
    'refreshToken 已轮换（与旧的不同）',
    refreshed.body?.refreshToken !== refreshToken,
    '轮换失败：泄露的 token 将长期可用'
  );

  const newAccess = refreshed.body?.accessToken;
  const newRefresh = refreshed.body?.refreshToken;

  const meAfterRefresh = await req('GET', '/me', { token: newAccess });
  check('新 accessToken 可用', meAfterRefresh.status === 200, `实际 ${meAfterRefresh.status}`);

  const reuseOld = await req('POST', '/auth/refresh', { body: { refreshToken } });
  check(
    '旧 refreshToken 已失效 (401)',
    reuseOld.status === 401,
    `实际 ${reuseOld.status}——轮换后旧 token 必须立即不可用`
  );

  // ---------- 登出 ----------
  console.log('\n[登出]');
  const logout = await req('POST', '/auth/logout', { body: { refreshToken: newRefresh } });
  check('登出成功 (200)', logout.status === 200, JSON.stringify(logout.body));

  const afterLogout = await req('POST', '/auth/refresh', { body: { refreshToken: newRefresh } });
  check(
    '登出后 refreshToken 不可用 (401)',
    afterLogout.status === 401,
    `实际 ${afterLogout.status}`
  );

  const logoutAgain = await req('POST', '/auth/logout', { body: { refreshToken: newRefresh } });
  check('重复登出保持幂等 (200)', logoutAgain.status === 200, `实际 ${logoutAgain.status}`);
  const logoutNoBody = await req('POST', '/auth/logout', { body: {} });
  check('无 token 登出也返回成功', logoutNoBody.status === 200, `实际 ${logoutNoBody.status}`);

  // ---------- 老用户再次登录 ----------
  console.log('\n[老用户再次登录]');
  const send2 = await req('POST', '/auth/send-code', { body: { phone: randomPhone() } });
  check('换号可立即发送（冷却按号隔离）', send2.status === 200, `实际 ${send2.status}`);

  // ---------- 邮箱注册 / 登录 ----------
  console.log('\n[邮箱通道]');
  const email = `t${Date.now()}@example.com`;
  const reg = await req('POST', '/auth/register-email', {
    body: { email, password: 'CorrectHorse123', deviceId: 'd2', platform: 'desktop' },
  });
  check('邮箱注册成功 (200)', reg.status === 200, JSON.stringify(reg.body));
  check('返回 accessToken', typeof reg.body?.accessToken === 'string');

  const dup = await req('POST', '/auth/register-email', {
    body: { email, password: 'CorrectHorse123' },
  });
  check('重复邮箱被拒 (400)', dup.status === 400, `实际 ${dup.status}`);
  check('错误码 EMAIL_TAKEN', dup.body?.error?.code === 'EMAIL_TAKEN');

  const emailLogin = await req('POST', '/auth/login-email', {
    body: { email, password: 'CorrectHorse123' },
  });
  check('邮箱登录成功 (200)', emailLogin.status === 200, JSON.stringify(emailLogin.body));

  const wrongPw = await req('POST', '/auth/login-email', {
    body: { email, password: 'WrongPassword123' },
  });
  check('错误密码被拒 (401)', wrongPw.status === 401, `实际 ${wrongPw.status}`);

  const noSuchEmail = await req('POST', '/auth/login-email', {
    body: { email: `nobody${Date.now()}@example.com`, password: 'CorrectHorse123' },
  });
  check(
    '不存在的邮箱与错误密码返回相同错误码（防账号枚举）',
    noSuchEmail.body?.error?.code === wrongPw.body?.error?.code,
    `${noSuchEmail.body?.error?.code} vs ${wrongPw.body?.error?.code}`
  );

  const shortPw = await req('POST', '/auth/register-email', {
    body: { email: `s${Date.now()}@example.com`, password: 'short' },
  });
  check('过短密码被拒 (400)', shortPw.status === 400, `实际 ${shortPw.status}`);

  console.log(
    `\n${pass} 条通过, ${fail} 条失败`
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n测试脚本异常:', err.message);
  console.error('请确认服务已启动：npm run dev');
  process.exit(1);
});
