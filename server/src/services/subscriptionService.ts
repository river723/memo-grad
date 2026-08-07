/**
 * 订阅状态与 AI 配额查询。
 *
 * 阶段 1 只需要"读"：/me 要返回当前套餐和剩余配额。
 * 阶段 3 的 quotaGuard 与阶段 4 的支付回调会复用这里的 getEntitlement。
 */

import { prisma } from '../db';
import { config } from '../config';

export interface Entitlement {
  /** 是否有权使用 AI 功能 */
  isPro: boolean;
  plan: string | null;
  status: 'active' | 'expired' | 'none';
  expiresAt: string | null;
  quota: {
    /** 本月上限；null 表示不限量 */
    monthlyLimit: number;
    /** 本月已用 */
    used: number;
    /** 剩余，不会为负 */
    remaining: number;
  };
}

/** 本月起点（UTC）。配额按自然月重置，与订阅周期解耦，用户更好理解。 */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * 取用户当前权益。
 *
 * 有效订阅的判定完全基于 expiresAt 与当前时间比较，不信任 status 字段——
 * status 靠定时任务维护，任务挂了会滞留成 active，那样就等于白送。
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const now = new Date();

  const active = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'active',
      startsAt: { lte: now },
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: 'desc' },
  });

  const isPro = Boolean(active);
  const monthlyLimit = isPro ? config.quota.proMonthly : config.quota.freeMonthly;

  // 只统计成功的调用：上游报错不该扣用户配额
  const used = await prisma.aiUsage.count({
    where: { userId, success: true, createdAt: { gte: startOfMonth() } },
  });

  return {
    isPro,
    plan: active?.plan ?? null,
    status: isPro ? 'active' : active ? 'expired' : 'none',
    expiresAt: active?.expiresAt.toISOString() ?? null,
    quota: {
      monthlyLimit,
      used,
      remaining: Math.max(0, monthlyLimit - used),
    },
  };
}
