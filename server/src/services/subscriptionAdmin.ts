/**
 * 订阅管理（管理后台写操作）。
 *
 * 重要约定：
 * - **"有效订阅"判定走 expiresAt 与当前时间比较**（与 subscriptionService.getEntitlement 同源），
 *   不信任 status 字段——status 靠定时任务维护，任务挂了会滞留成 active。
 * - **grant 与 revoke 都是写操作**。每个都必走 writeAuditLog。
 * - **授权 subscription 不创建 Order**——这是后台离线操作，与渠道支付无关。
 *   前端要把 source='manual'/'gift' 的订阅与 source='wechat'/'alipay' 的分别显示，
 *   且不允许对前者触发「退款」（Phase E 实现）。
 */

import type { FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';
import { writeAuditLog } from './auditLog';

const VALID_PLANS = ['monthly', 'quarterly', 'yearly'] as const;
const VALID_SOURCES = ['manual', 'gift'] as const;
// 渠道支付来源的订阅——退款时需同步撤销
const PAID_SOURCES = ['wechat', 'alipay'] as const;

export type GrantPlan = typeof VALID_PLANS[number];
export type GrantSource = typeof VALID_SOURCES[number];

/**
 * 找出用户当前有效订阅。逻辑与 getEntitlement 保持一致。
 * 没找到时返回 null，不抛错——授权前先看是否已有，授权本身是允许新建的。
 */
async function findActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: 'active',
      startsAt: { lte: new Date() },
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: 'desc' },
  });
}

// ==================== grantSubscription ====================

export interface GrantSubscriptionParams {
  plan: GrantPlan;
  days: number;
  source: GrantSource;
  /** 管理员备注（如「补偿 7 天因服务故障」） */
  note?: string;
}

export async function grantSubscription(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string,
  params: GrantSubscriptionParams
): Promise<{ subscriptionId: string; startsAt: Date; expiresAt: Date }> {
  if (!VALID_PLANS.includes(params.plan)) {
    throw ApiError.badRequest('INVALID_PARAMS', `plan 必须是 ${VALID_PLANS.join('/')}`);
  }
  if (!VALID_SOURCES.includes(params.source)) {
    throw ApiError.badRequest('INVALID_PARAMS', `source 必须是 ${VALID_SOURCES.join('/')}`);
  }
  if (!Number.isFinite(params.days) || params.days <= 0 || params.days > 3650) {
    throw ApiError.badRequest('INVALID_PARAMS', 'days 必须是 1..3650');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }

  // 同一时间只允许一条有效订阅；否则会出现"先到期的覆盖后到期的"展示混乱
  const existing = await findActiveSubscription(userId);
  if (existing) {
    throw ApiError.conflict(
      'SUB_ALREADY_ACTIVE',
      '该用户已有有效订阅，请先撤销再授权',
      { existingSubscriptionId: existing.id, existingExpiresAt: existing.expiresAt.toISOString() }
    );
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + params.days * 24 * 60 * 60 * 1000);

  const sub = await prisma.subscription.create({
    data: {
      userId,
      plan: params.plan,
      status: 'active',
      startsAt,
      expiresAt,
      source: params.source,
    },
    select: { id: true, startsAt: true, expiresAt: true, plan: true, source: true },
  });

  await writeAuditLog(request, adminId, {
    action: 'sub.grant',
    targetType: 'subscription',
    targetId: sub.id,
    before: null,
    after: {
      plan: sub.plan,
      source: sub.source,
      startsAt: sub.startsAt.toISOString(),
      expiresAt: sub.expiresAt.toISOString(),
    },
    note: params.note || `${params.days} 天 ${params.plan} (${params.source})`,
  });

  return { subscriptionId: sub.id, startsAt, expiresAt };
}

// ==================== revokeSubscription ====================

export interface RevokeSubscriptionParams {
  /** 管理员备注（如「试用不通过」） */
  note?: string;
}

export async function revokeSubscription(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string,
  params: RevokeSubscriptionParams = {}
): Promise<{ subscriptionId: string; beforeStatus: string; afterStatus: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }

  const active = await findActiveSubscription(userId);
  if (!active) {
    throw ApiError.notFound('SUB_NOT_FOUND', '该用户当前没有有效订阅');
  }

  const updated = await prisma.subscription.update({
    where: { id: active.id },
    data: { status: 'refunded' },
    select: { id: true, status: true, plan: true, source: true, expiresAt: true },
  });

  await writeAuditLog(request, adminId, {
    action: 'sub.revoke',
    targetType: 'subscription',
    targetId: updated.id,
    before: { status: active.status, expiresAt: active.expiresAt.toISOString() },
    after: { status: updated.status },
    note: params.note || `撤销订阅（${updated.plan}，来源 ${updated.source}）`,
  });

  return {
    subscriptionId: updated.id,
    beforeStatus: active.status,
    afterStatus: updated.status,
  };
}

// ==================== refundOrder（订单退款） ====================

export interface RefundOrderParams {
  outTradeNo: string;
  /** 退款原因（管理员必填，审计可见） */
  reason: string;
}

export interface RefundOrderResult {
  orderId: string;
  beforeStatus: string;
  afterStatus: string;
  /** 同步撤销的订阅 ID；如果找不到匹配订阅则为 null */
  refundedSubscriptionId: string | null;
  /** 退款成功但未找到匹配订阅时的提示 */
  warning: string | null;
}

/**
 * 退款：把 Order.status='refunded'，并尝试找到匹配订阅同步置 refunded。
 *
 * 匹配规则（兜底启发式）：
 *   - 同 userId
 *   - status='active' 且 source in ['wechat', 'alipay']（渠道来源，不是后台授权）
 *   - startsAt 在 order.paidAt ± 5 分钟内（处理 webhook 延迟）
 *   - 多个候选时取 startsAt 最接近 paidAt 的那一条
 *
 * 找不到匹配订阅时仍退款订单（不阻塞），但返回 warning 让前端提示。
 * 二次退款幂等：order.status 已是 refunded 时直接返回，不再改。
 */
export async function refundOrder(
  request: FastifyRequest | undefined,
  adminId: string,
  userId: string,
  params: RefundOrderParams
): Promise<RefundOrderResult> {
  if (!params.reason || params.reason.trim().length === 0) {
    throw ApiError.badRequest('INVALID_PARAMS', '退款原因必填');
  }

  const order = await prisma.order.findUnique({ where: { outTradeNo: params.outTradeNo } });
  if (!order) {
    throw ApiError.notFound('ORDER_NOT_FOUND', '订单不存在');
  }
  if (order.userId !== userId) {
    // 防越权：URL 上的 userId 必须是订单 owner
    throw ApiError.forbidden('ORDER_NOT_OWNED', '该订单不属于此用户');
  }
  if (order.status === 'refunded') {
    // 幂等
    return {
      orderId: order.id,
      beforeStatus: 'refunded',
      afterStatus: 'refunded',
      refundedSubscriptionId: null,
      warning: '订单已退款，跳过',
    };
  }
  if (order.status !== 'paid') {
    throw ApiError.badRequest(
      'ORDER_NOT_REFUNDABLE',
      `订单当前状态为 ${order.status}，仅 paid 订单可退款`
    );
  }

  // 找匹配订阅
  const paidAt = order.paidAt ?? order.createdAt;
  const windowMs = 5 * 60 * 1000;
  const candidates = await prisma.subscription.findMany({
    where: {
      userId,
      status: 'active',
      source: { in: [...PAID_SOURCES] },
      startsAt: {
        gte: new Date(paidAt.getTime() - windowMs),
        lte: new Date(paidAt.getTime() + windowMs),
      },
    },
  });

  // 取最接近 paidAt 的
  let matched: typeof candidates[number] | null = null;
  if (candidates.length > 0) {
    matched = candidates.reduce((best, cur) => {
      const bestDist = Math.abs(best.startsAt.getTime() - paidAt.getTime());
      const curDist = Math.abs(cur.startsAt.getTime() - paidAt.getTime());
      return curDist < bestDist ? cur : best;
    });
  }

  // 事务：order.status='refunded' + 可选 matched.status='refunded'
  const result = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: { status: 'refunded' },
      select: { id: true, status: true, outTradeNo: true, plan: true, amountFen: true, channel: true },
    });
    let updatedSub: { id: string; plan: string; source: string } | null = null;
    if (matched) {
      updatedSub = await tx.subscription.update({
        where: { id: matched.id },
        data: { status: 'refunded' },
        select: { id: true, plan: true, source: true },
      });
    }
    return { updatedOrder, updatedSub };
  });

  const warning = result.updatedSub
    ? null
    : `未找到匹配的 active 订阅（渠道来源、paidAt ± 5 分钟内）。订单已退款，请在订阅历史中手动处理。`;

  await writeAuditLog(request, adminId, {
    action: 'sub.refund',
    targetType: 'order',
    targetId: result.updatedOrder.id,
    before: {
      orderStatus: order.status,
      subscriptionStatus: matched?.status ?? null,
    },
    after: {
      orderStatus: 'refunded',
      subscriptionStatus: result.updatedSub ? 'refunded' : null,
    },
    note: `${params.reason}；订单 ${result.updatedOrder.outTradeNo} (${result.updatedOrder.plan}, ¥${(result.updatedOrder.amountFen / 100).toFixed(2)})${result.updatedSub ? `；同步撤销订阅 ${result.updatedSub.id}` : ''}`,
  });

  return {
    orderId: result.updatedOrder.id,
    beforeStatus: order.status,
    afterStatus: 'refunded',
    refundedSubscriptionId: result.updatedSub?.id ?? null,
    warning,
  };
}
