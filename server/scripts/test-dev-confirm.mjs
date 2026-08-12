// Dev confirm 订阅流程端到端验证
//  覆盖：登录 → /me 初始状态 → 下单 → dev confirm → 轮询 → /me 最终状态

const BASE = 'http://127.0.0.1:3000';
// 随机手机号避免和上次测试撞数据
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

function expect(label, cond, detail) {
  const mark = cond ? '✅' : '❌';
  console.log(`  ${mark} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

console.log(`\n[1/7] 用随机手机号登录: ${phone}`);
const send = await req('POST', '/auth/send-code', { body: { phone } });
expect('send-code 200', send.status === 200, `status=${send.status}`);
const code = send.body?.devCode;
expect('devCode 已回显', !!code);

const login = await req('POST', '/auth/login', {
  body: { phone, code, deviceId: 'dev-confirm-test', platform: 'web' },
});
expect('login 200', login.status === 200);
const token = login.body?.accessToken;
expect('拿到 accessToken', !!token);

console.log('\n[2/7] 初始 /me — 应当是免费版');
const meBefore = await req('GET', '/me', { token });
expect('/me 200', meBefore.status === 200);
expect('isPro = false', meBefore.body?.entitlement?.isPro === false,
  `isPro=${meBefore.body?.entitlement?.isPro}`);
expect('plan = null', meBefore.body?.entitlement?.plan === null,
  `plan=${meBefore.body?.entitlement?.plan}`);
expect('quota.monthlyLimit = 0 (免费)',
  meBefore.body?.entitlement?.quota?.monthlyLimit === 0,
  `monthlyLimit=${meBefore.body?.entitlement?.quota?.monthlyLimit}`);

console.log('\n[3/7] 拉套餐列表');
const plans = await req('GET', '/api/pay/plans', { token });
expect('plans 200', plans.status === 200);
expect('plans 至少 1 个', Array.isArray(plans.body) && plans.body.length >= 1,
  `count=${plans.body?.length}`);
const monthly = plans.body?.find(p => p.id === 'monthly');
expect('monthly 套餐存在', !!monthly, monthly ? `¥${monthly.priceYuan}/${monthly.days}天` : 'missing');

console.log('\n[4/7] 创建订单');
const order = await req('POST', '/api/pay/orders', {
  token, body: { plan: 'monthly', channel: 'wechat' },
});
expect('order 200', order.status === 200, `status=${order.status}`);
expect('返回 outTradeNo', !!order.body?.outTradeNo, order.body?.outTradeNo);
expect('status = pending', order.body?.status === 'pending',
  `status=${order.body?.status}`);
expect('qrCode 是 dev confirm URL',
  String(order.body?.qrCode || '').includes('/api/pay/webhooks/confirm'),
  order.body?.qrCode?.slice(0, 80));

console.log('\n[5/7] 触发 dev confirm（GET /webhooks/confirm）');
const confirmRes = await fetch(order.body.qrCode, { method: 'GET' });
expect('confirm 200', confirmRes.status === 200, `status=${confirmRes.status}`);
const confirmHtml = await confirmRes.text();
expect('HTML 含"支付成功"', confirmHtml.includes('支付成功'),
  confirmHtml.match(/<h1>[^<]+/)?.[0] || 'no h1');

console.log('\n[6/7] 轮询订单状态');
let paid = false;
for (let i = 0; i < 5; i++) {
  const poll = await req('GET', `/api/pay/orders/${order.body.outTradeNo}`, { token });
  if (poll.body?.status === 'paid') {
    paid = true;
    console.log(`  第 ${i + 1} 次轮询即 paid`);
    break;
  }
  await new Promise(r => setTimeout(r, 500));
}
expect('订单变 paid', paid);

console.log('\n[7/7] 再次 /me — 应当是 Pro');
const meAfter = await req('GET', '/me', { token });
expect('/me 200', meAfter.status === 200);
expect('isPro = true', meAfter.body?.entitlement?.isPro === true,
  `isPro=${meAfter.body?.entitlement?.isPro}`);
expect('plan = monthly',
  meAfter.body?.entitlement?.plan === 'monthly',
  `plan=${meAfter.body?.entitlement?.plan}`);
expect('status = active',
  meAfter.body?.entitlement?.status === 'active',
  `status=${meAfter.body?.entitlement?.status}`);
expect('expiresAt 已设置',
  !!meAfter.body?.entitlement?.expiresAt,
  meAfter.body?.entitlement?.expiresAt);
expect('quota.monthlyLimit = 300 (Pro)',
  meAfter.body?.entitlement?.quota?.monthlyLimit === 300,
  `monthlyLimit=${meAfter.body?.entitlement?.quota?.monthlyLimit}`);
expect('quota.used = 0 (刚订阅未用)',
  meAfter.body?.entitlement?.quota?.used === 0,
  `used=${meAfter.body?.entitlement?.quota?.used}`);
expect('quota.remaining = 300',
  meAfter.body?.entitlement?.quota?.remaining === 300,
  `remaining=${meAfter.body?.entitlement?.quota?.remaining}`);

console.log(`\n[手机号] ${phone}  (保留作下次回归)`);
console.log(process.exitCode ? '\n❌ 有断言失败' : '\n✅ dev confirm 链路全部通过');
