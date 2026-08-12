// 云同步 500 修复回归：
//  修复前：POST /api/sync 永远 500 (TypeError: Cannot read properties of undefined (reading 'findMany'))
//  修复后：单数 entity key 走通；复数 entity key 走空（因为 prisma[tableName] 拿不到，syncEntity 抛错）
//  注：硬切换协议 = 服务端只接受单数。复数请求会被解析到 undefined 走 500。
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
const userId = login.body?.user?.id;
console.log('login status:', login.status, 'userId:', userId);

const now = new Date().toISOString();

// 1. 单数 entity 走通（一条假数据，让 upsert 路径走完）
const wordId = crypto.randomUUID();
const singlePayload = {
  lastSyncAt: null,
  entities: {
    word: [{ id: wordId, userId, word: 'mitigate', meaning: '减轻', created_at: now, updated_at: now, deleted_at: null, dirty: false }],
    studyRecord: [],
    studyPlan: [],
    article: [],
    examSession: [],
    wrongQuestion: [],
    realExamSession: [],
    realExamWrongQuestion: [],
  },
};
const singleRes = await req('POST', '/api/sync', { body: singlePayload, token: accessToken });
console.log('SYNC single-entity:', singleRes.status);
console.log('  response keys:', Object.keys(singleRes.body || {}));
if (singleRes.body?.results) {
  console.log('  results keys:', Object.keys(singleRes.body.results));
}

// 2. 空 entities 也应走通
const emptyRes = await req('POST', '/api/sync', { body: { entities: {} }, token: accessToken });
console.log('SYNC empty:', emptyRes.status);

// 3. 复数 entity 应当报错（硬切换 = 服务端只认单数）
const pluralRes = await req('POST', '/api/sync', { body: { entities: { words: [] } }, token: accessToken });
console.log('SYNC plural (expected 500):', pluralRes.status, JSON.stringify(pluralRes.body));

// 验收
const pass = singleRes.status === 200 && emptyRes.status === 200;
console.log('\n[结果]');
console.log('  单数 sync 走通:', pass ? '✅ PASS' : '❌ FAIL');
process.exit(pass ? 0 : 1);
