/**
 * 订阅与支付路由。
 *
 * 订单流程：
 *   1. POST /api/pay/orders — 创建订单，返回支付二维码（微信Native / 支付宝扫码）
 *   2. POST /api/pay/webhooks/wechat — 微信支付回调（验签 + 幂等）
 *   3. POST /api/pay/webhooks/alipay — 支付宝回调（验签 + 幂等）
 *
 * 支付回调成功后：
 *   - 更新 orders.status = 'paid'
 *   - 创建/延长 subscriptions（买断一个月）
 *   - 通知前端轮询结束
 *
 * 开发模式下不走真实支付通道，POST /orders 直接返回"模拟支付"二维码，
 * POST /webhooks/confirm 一键确认支付（跳过扫码）。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { config } from '../config';
import { ApiError } from '../errors';

const PLAN_PRICES: Record<string, { name: string; priceFen: number; days: number }> = {
  monthly: { name: '月度会员', priceFen: 1990, days: 30 },
  quarterly: { name: '季度会员', priceFen: 4990, days: 90 },
  yearly: { name: '年度会员', priceFen: 14900, days: 365 },
};

/** 生成唯一订单号 */
function generateOutTradeNo(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `MG${ts}${rand}`.toUpperCase();
}

export default async function paymentRoutes(app: FastifyInstance) {
  // 鉴权策略：
  // - 用户面（/plans, /orders, /orders/:outTradeNo, /my-subscription）走 app.authGuard
  // - /webhooks/* 不走 JWT：dev/confirm 用 outTradeNo+userId 自身做凭据；
  //   生产 wechat/alipay 由支付平台签名替代
  // 因此这里不挂全局 hook，而是按路由加 preHandler。

  // ---- 套餐列表 ----
  app.get('/plans', { preHandler: app.authGuard }, async () => {
    return Object.entries(PLAN_PRICES).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      priceFen: plan.priceFen,
      priceYuan: (plan.priceFen / 100).toFixed(2),
      days: plan.days,
    }));
  });

  // ---- 创建订单 ----
  app.post('/orders', { preHandler: app.authGuard }, async (request: FastifyRequest) => {
    const userId = request.userId!;
    const body = request.body as { plan: string; channel?: string };
    const planKey = body.plan || 'monthly';
    const channel = body.channel || 'wechat';

    const plan = PLAN_PRICES[planKey];
    if (!plan) {
      throw ApiError.badRequest('INVALID_PLAN', '无效的套餐', { validPlans: Object.keys(PLAN_PRICES) });
    }

    const outTradeNo = generateOutTradeNo();

    const order = await prisma.order.create({
      data: {
        userId,
        outTradeNo,
        channel,
        plan: planKey,
        amountFen: plan.priceFen,
        status: 'pending',
      },
    });

    // 开发模式：直接返回模拟支付链接（跳过真实扫码）。
    // 链接用请求的 Host 头拼接——客户端从哪个地址调 API，确认请求就回哪个地址，
    // 避免写死 127.0.0.1:3000 导致局域网/打包客户端（如 NAS 部署）确认不到订单。
    const isDev = !config.isProduction;
    const proto = request.protocol || 'http';
    const forwardedHost = request.headers['x-forwarded-host'] || request.headers['host'];
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : (forwardedHost as string) || '127.0.0.1:3000';
    const qrCode = isDev
      ? `${proto}://${host}/api/pay/webhooks/confirm?outTradeNo=${outTradeNo}&userId=${userId}`
      : `weixin://wxpay/bizpayurl?pr=${outTradeNo}`;

    return {
      orderId: order.id,
      outTradeNo: order.outTradeNo,
      plan: plan.name,
      amountFen: plan.priceFen,
      amountYuan: (plan.priceFen / 100).toFixed(2),
      qrCode,
      channel,
      status: 'pending',
      createdAt: order.createdAt.toISOString(),
    };
  });

  // ---- 查询订单状态（前端轮询） ----
  app.get('/orders/:outTradeNo', { preHandler: app.authGuard }, async (request: FastifyRequest) => {
    const userId = request.userId!;
    const { outTradeNo } = request.params as { outTradeNo: string };

    const order = await prisma.order.findUnique({
      where: { outTradeNo },
    });

    if (!order || order.userId !== userId) {
      throw ApiError.notFound('ORDER_NOT_FOUND', '订单不存在');
    }

    return {
      outTradeNo: order.outTradeNo,
      status: order.status,
      plan: order.plan,
      amountFen: order.amountFen,
      paidAt: order.paidAt?.toISOString() || null,
    };
  });

  // ---- 开发模式：一键确认支付（跳过真实扫码） ----
  app.get('/webhooks/confirm', async (request: FastifyRequest, reply) => {
    if (config.isProduction) {
      throw ApiError.badRequest('DEV_ONLY', '该接口仅在开发模式下可用');
    }

    const query = request.query as { outTradeNo?: string; userId?: string };
    const { outTradeNo, userId } = query;

    if (!outTradeNo || !userId) {
      throw ApiError.badRequest('INVALID_PARAMS', '缺少 outTradeNo 或 userId');
    }

    const order = await prisma.order.findUnique({ where: { outTradeNo } });
    if (!order) {
      throw ApiError.notFound('ORDER_NOT_FOUND', '订单不存在');
    }
    if (order.status === 'paid') {
      return reply.type('text/html; charset=utf-8').send(
        '<!doctype html><meta charset="utf-8"><title>已支付</title>' +
        '<body style="font-family:sans-serif;text-align:center;padding-top:80px">' +
        '<h2>✅ 该订单已支付</h2>' +
        '</body>'
      );
    }

    const now = new Date();
    const plan = PLAN_PRICES[order.plan];
    const expiresAt = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

    // 事务：更新订单 + 创建/延长订阅。
    // 用 callback 形式而非数组形式——数组形式要求每项都是 Prisma promise，
    // 没法写"先查后写"的依赖链；callback 里可以任意 await。
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { outTradeNo },
        data: { status: 'paid', paidAt: now, transactionId: `DEV_${outTradeNo}` },
      });

      const existing = await tx.subscription.findFirst({
        where: { userId: order.userId, status: 'active', expiresAt: { gt: now } },
        orderBy: { expiresAt: 'desc' },
      });

      if (existing) {
        // 延长现有订阅：在最新到期日基础上再续 plan.days
        const newExpiresAt = new Date(
          Math.max(existing.expiresAt.getTime(), now.getTime()) + plan.days * 24 * 60 * 60 * 1000
        );
        await tx.subscription.update({
          where: { id: existing.id },
          data: { expiresAt: newExpiresAt },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId: order.userId,
            plan: order.plan,
            status: 'active',
            startsAt: now,
            expiresAt,
            source: order.channel,
          },
        });
      }
    });

    return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>支付成功</title>
</head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px">
  <h1>✅ 支付成功！</h1>
  <p>订单号：${outTradeNo}</p>
  <p>套餐：${plan.name}</p>
  <p>到期时间：${expiresAt.toISOString()}</p>
  <p style="color:#666">请返回 App 刷新订阅状态</p>
</body>
</html>`);
  });

  // ---- 微信支付回调（生产环境验签） ----
  app.post('/webhooks/wechat', async (request: FastifyRequest) => {
    // TODO: 验签 wechatpay-signature
    const body = request.body as any;

    if (!body.out_trade_no || body.trade_state !== 'SUCCESS') {
      return { code: 'FAIL', message: 'invalid params' };
    }

    const outTradeNo = body.out_trade_no;
    const order = await prisma.order.findUnique({ where: { outTradeNo } });

    if (!order) {
      return { code: 'FAIL', message: 'order not found' };
    }
    if (order.status === 'paid') {
      return { code: 'SUCCESS', message: 'already paid' }; // 幂等
    }

    const now = new Date();
    const plan = PLAN_PRICES[order.plan] || PLAN_PRICES.monthly;
    const expiresAt = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.order.update({
        where: { outTradeNo },
        data: { status: 'paid', paidAt: now, transactionId: body.transaction_id, rawCallback: body },
      }),
      prisma.subscription.create({
        data: {
          userId: order.userId,
          plan: order.plan,
          status: 'active',
          startsAt: now,
          expiresAt,
          source: 'wechat',
        },
      }),
    ]);

    return { code: 'SUCCESS' };
  });

  // ---- 支付宝回调（生产环境验签） ----
  app.post('/webhooks/alipay', async (request: FastifyRequest) => {
    // TODO: 验签 alipay-sign
    const body = request.body as any;

    if (body.trade_status !== 'TRADE_SUCCESS') {
      return { code: 'FAIL', message: 'trade not success' };
    }

    const outTradeNo = body.out_trade_no;
    const order = await prisma.order.findUnique({ where: { outTradeNo } });

    if (!order) return { code: 'FAIL', message: 'order not found' };
    if (order.status === 'paid') return { code: 'SUCCESS' }; // 幂等

    const now = new Date();
    const plan = PLAN_PRICES[order.plan] || PLAN_PRICES.monthly;
    const expiresAt = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.order.update({
        where: { outTradeNo },
        data: { status: 'paid', paidAt: now, transactionId: body.trade_no, rawCallback: body },
      }),
      prisma.subscription.create({
        data: {
          userId: order.userId,
          plan: order.plan,
          status: 'active',
          startsAt: now,
          expiresAt,
          source: 'alipay',
        },
      }),
    ]);

    return { code: 'SUCCESS' };
  });

  // ---- 当前用户订阅状态 ----
  app.get('/my-subscription', { preHandler: app.authGuard }, async (request: FastifyRequest) => {
    const userId = request.userId!;
    const now = new Date();

    const sub = await prisma.subscription.findFirst({
      where: { userId, status: 'active', expiresAt: { gt: now } },
      orderBy: { expiresAt: 'desc' },
    });

    const orders = await prisma.order.findMany({
      where: { userId, status: 'paid' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      isPro: !!sub,
      plan: sub?.plan || null,
      status: sub ? 'active' : 'none',
      expiresAt: sub?.expiresAt?.toISOString() || null,
      history: orders.map((o) => ({
        outTradeNo: o.outTradeNo,
        plan: o.plan,
        amountFen: o.amountFen,
        paidAt: o.paidAt?.toISOString() || null,
      })),
    };
  });
}
