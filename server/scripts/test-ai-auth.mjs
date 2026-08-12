// AI 鉴权回归验证：
//  修复前：aiRoutes 的 preHandler 只读 request.userId（永远 undefined）→ 401 "请先登录"
//  修复后：改用 app.authGuard → 401 来自 token 验证失败，业务调用 200 / 4xx / 5xx 都视为通过
const BASE = 'http://127.0.0.1:3000';
const phone = `13${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

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
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const send = await req('POST', '/auth/send-code', { body: { phone } });
const code = send.body?.devCode;
const login = await req('POST', '/auth/login', { body: { phone, code, deviceId: 't', platform: 'web' } });
const accessToken = login.body?.accessToken;
console.log('login status:', login.status, 'isNewUser:', login.body?.isNewUser);

// 1. 不带 token 调 AI：应被拒 401（兜底鉴权工作）
const noAuth = await req('POST', '/api/ai/analyzeWord', { body: { word: 'mitigate' } });
console.log('AI no-token:', noAuth.status, JSON.stringify(noAuth.body));

// 2. 带伪造 token：应被拒 401
const fakeAuth = await req('POST', '/api/ai/analyzeWord', { body: { word: 'mitigate' }, token: 'garbage' });
console.log('AI fake-token:', fakeAuth.status, JSON.stringify(fakeAuth.body));

// 3. 带真实 token：必须 NOT 401 "请先登录"——可能 200 (上游通了) / 500 (AI_NOT_CONFIGURED) / 402 (无配额) 都算鉴权通过
const realAuth = await req('POST', '/api/ai/analyzeWord', { body: { word: 'mitigate' }, token: accessToken });
console.log('AI real-token:', realAuth.status, JSON.stringify(realAuth.body));

// 4. 同步路由同样的回归
const syncNoAuth = await req('POST', '/api/sync', { body: { entities: {} } });
const syncReal = await req('POST', '/api/sync', { body: { entities: {} }, token: accessToken });
console.log('SYNC no-token:', syncNoAuth.status, JSON.stringify(syncNoAuth.body));
console.log('SYNC real-token:', syncReal.status, JSON.stringify(syncReal.body));

// 验收
const aiFixed = realAuth.status !== 401 || realAuth.body?.error?.code !== 'NOT_AUTHENTICATED';
const syncFixed = syncReal.status !== 401 || syncReal.body?.error?.code !== 'NOT_AUTHENTICATED';
console.log('\n[结果]');
console.log('  AI 鉴权修复:', aiFixed ? '✅ PASS' : '❌ FAIL 仍返回 401 NOT_AUTHENTICATED');
console.log('  SYNC 鉴权修复:', syncFixed ? '✅ PASS' : '❌ FAIL 仍返回 401 NOT_AUTHENTICATED');
process.exit(aiFixed && syncFixed ? 0 : 1);
