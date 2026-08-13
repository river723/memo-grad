/**
 * 管理员路由：提供对 admin 接口的访问入口。
 * 仅当用户已登录且具备管理员角色时，方可访问。
 *
 * 接口（Phase A：基础 + 审计 + 降级撤销 refresh token）：
 *   GET    /api/admin/users        → 用户列表（分页+搜索）
 *   GET    /api/admin/users/:id    → 用户详情
 *   DELETE /api/admin/users/:id    → 软删除/封禁用户（带审计 + 强制下线）
 *   PATCH  /api/admin/users/:id    → 更新用户字段（role / disabled，带审计 + 撤销）
 *   GET    /api/admin/stats        → 全局统计概览
 *
 * Phase C 起会继续在这里加 reset-password / grant-subscription / refund 等端点。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors';
import { prisma } from '../db';
import { listUsersWithFilters, getUserDetailAggregated, listOrders, type ListUsersFilters } from '../services/adminQueries';
import {
  setDisabled,
  setRole,
  resetPassword,
  forceLogout,
  resetAiQuota,
} from '../services/userAdmin';
import { grantSubscription, revokeSubscription, refundOrder } from '../services/subscriptionAdmin';
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  type ListAnnouncementsFilters,
} from '../services/announcementService';
import { parseBody } from '../utils/parseBody';

// 扩展 request 类型：admin 路由的 preHandler 会写入 adminId
declare module 'fastify' {
  interface FastifyRequest {
    /** 当前请求的 admin userId，由 adminRoutes 的 preHandler 写入。 */
    adminId?: string;
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  // Step 1: JWT 认证 → request.userId
  // Step 2: role 校验 → 仅 admin 可通过；通过后挂 request.adminId 供审计使用
  app.addHook('preHandler', app.authGuard);
  app.addHook('preHandler', async (request: FastifyRequest) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: { id: true, role: true, disabled: true },
    });
    if (!user || user.disabled || user.role !== 'admin') {
      throw ApiError.forbidden('NOT_ADMIN', '仅管理员可访问此接口');
    }
    request.adminId = user.id;
  });

  // ---- GET /api/admin/users ----
  // 列表：分页 + 多维筛选（search/role/disabled/createdFrom-To/lastSyncFrom-To/sort/order）。
  // 实际聚合查询在 services/adminQueries.ts，路由层只做参数透传。
  app.get('/users', async (request: FastifyRequest) => {
    const q = request.query as Record<string, string>;
    const filters: ListUsersFilters = {
      page: parseInt(q.page),
      limit: parseInt(q.limit),
      search: q.search || undefined,
      role: (q.role === 'user' || q.role === 'admin') ? q.role : undefined,
      disabled: q.disabled === 'true' ? true : q.disabled === 'false' ? false : undefined,
      createdFrom: q.createdFrom || undefined,
      createdTo: q.createdTo || undefined,
      lastSyncFrom: q.lastSyncFrom || undefined,
      lastSyncTo: q.lastSyncTo || undefined,
      sort: (q.sort === 'createdAt' || q.sort === 'updatedAt' || q.sort === 'lastSyncAt') ? q.sort : undefined,
      order: q.order === 'asc' ? 'asc' : 'desc',
    };
    return await listUsersWithFilters(filters);
  });

  // ---- GET /api/admin/users/:id ----
  // 详情：基础字段 + 9 个聚合面板（devices / subs / orders / ai / footprint / study / entitlement）
  app.get<{ Params: { id: string } }>('/users/:id', async (request) => {
    const { id } = request.params;
    const detail = await getUserDetailAggregated(id);
    if (!detail) {
      throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
    }
    return detail;
  });

  // ---- DELETE /api/admin/users/:id ----
  // 软封禁：等价于 PATCH { disabled: true }，保留 DELETE 路径以兼容老客户端。
  app.delete<{ Params: { id: string } }>('/users/:id', async (request) => {
    const { id } = request.params;
    const adminId = request.adminId!;
    const result = await setDisabled(request, adminId, id, { disabled: true });
    return result.alreadyInState
      ? { success: true, id, alreadyDisabled: true }
      : { success: true, id, revokedTokens: result.revokedTokens };
  });

  // ---- PATCH /api/admin/users/:id ----
  // 更新 role / disabled。每个字段独立路由。
  const patchBody = z.object({
    role: z.enum(['user', 'admin']).optional(),
    disabled: z.boolean().optional(),
  });
  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const data = parseBody(patchBody, request.body);

      if (data.role === undefined && data.disabled === undefined) {
        throw ApiError.badRequest('INVALID_PARAMS', '没有提供有效的更新字段');
      }

      // 两个字段独立事务：role 改了不影响 disabled 的 LAST_ADMIN 检查
      let revokedTokens = 0;
      if (data.role !== undefined) {
        const r = await setRole(request, adminId, id, data.role);
        revokedTokens += r.revokedTokens;
      }
      if (data.disabled !== undefined) {
        const r = await setDisabled(request, adminId, id, {
          disabled: data.disabled,
          reason: 'PATCH 封禁',
        });
        revokedTokens += r.revokedTokens;
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, disabled: true, disabledAt: true, disabledReason: true, disabledById: true },
      });
      return { user, revokedTokens };
    }
  );

  // ---- POST /api/admin/users/:id/reset-password ----
  const resetPasswordBody = z.object({
    newPassword: z.string().min(8, '密码至少 8 位').max(128),
  });
  app.post<{ Params: { id: string } }>(
    '/users/:id/reset-password',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const data = parseBody(resetPasswordBody, request.body);
      const result = await resetPassword(request, adminId, id, data);
      return { success: true, id, revokedTokens: result.revokedTokens };
    }
  );

  // ---- POST /api/admin/users/:id/force-logout ----
  app.post<{ Params: { id: string } }>(
    '/users/:id/force-logout',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const result = await forceLogout(request, adminId, id);
      return { success: true, id, revokedTokens: result.revokedTokens };
    }
  );

  // ---- POST /api/admin/users/:id/reset-ai-quota ----
  app.post<{ Params: { id: string } }>(
    '/users/:id/reset-ai-quota',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const result = await resetAiQuota(request, adminId, id);
      return { success: true, id, deletedRows: result.deletedRows };
    }
  );

  // ---- POST /api/admin/users/:id/grant-subscription ----
  // 离线授权订阅：body={plan, days, source: 'manual'|'gift', note?}
  const grantSubBody = z.object({
    plan: z.enum(['monthly', 'quarterly', 'yearly']),
    days: z.number().int().positive().max(3650),
    source: z.enum(['manual', 'gift']),
    note: z.string().max(500).optional(),
  });
  app.post<{ Params: { id: string } }>(
    '/users/:id/grant-subscription',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const data = parseBody(grantSubBody, request.body);
      const result = await grantSubscription(request, adminId, id, data);
      return { success: true, ...result };
    }
  );

  // ---- POST /api/admin/users/:id/revoke-subscription ----
  // 撤销有效订阅（status=active → refunded），不删行
  const revokeSubBody = z.object({
    note: z.string().max(500).optional(),
  });
  app.post<{ Params: { id: string } }>(
    '/users/:id/revoke-subscription',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const data = parseBody(revokeSubBody, request.body ?? {});
      const result = await revokeSubscription(request, adminId, id, data);
      return { success: true, ...result };
    }
  );

  // ---- POST /api/admin/users/:id/refund-order ----
  // 退款：transaction(order.status='refunded' + 同步撤销匹配订阅)
  const refundOrderBody = z.object({
    outTradeNo: z.string().min(1).max(128),
    reason: z.string().min(1, '退款原因必填').max(500),
  });
  app.post<{ Params: { id: string } }>(
    '/users/:id/refund-order',
    async (request) => {
      const { id } = request.params;
      const adminId = request.adminId!;
      const data = parseBody(refundOrderBody, request.body);
      const result = await refundOrder(request, adminId, id, data);
      return { success: true, ...result };
    }
  );

  // ---- GET /api/admin/orders ----
  // 跨用户订单列表：分页 + 多维筛选
  app.get('/orders', async (request: FastifyRequest) => {
    const q = request.query as Record<string, string>;
    const result = await listOrders({
      page: parseInt(q.page),
      limit: parseInt(q.limit),
      userId: q.userId || undefined,
      search: q.search || undefined,
      status: (q.status === 'pending' || q.status === 'paid' || q.status === 'closed' || q.status === 'refunded') ? q.status : undefined,
      channel: (q.channel === 'wechat' || q.channel === 'alipay') ? q.channel : undefined,
      paidFrom: q.paidFrom || undefined,
      paidTo: q.paidTo || undefined,
    });
    return result;
  });

  // ---- GET /api/admin/announcements ----
  app.get('/announcements', async (request: FastifyRequest) => {
    const q = request.query as Record<string, string>;
    const filters: ListAnnouncementsFilters = {
      page: parseInt(q.page),
      limit: parseInt(q.limit),
      audience: (q.audience === 'all' || q.audience === 'pro') ? q.audience : undefined,
    };
    return await listAnnouncements(filters);
  });

  // ---- POST /api/admin/announcements ----
  const createAnnouncementBody = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    audience: z.enum(['all', 'pro']),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  });
  app.post('/announcements', async (request: FastifyRequest) => {
    const adminId = request.adminId!;
    const data = parseBody(createAnnouncementBody, request.body);
    return await createAnnouncement(request, adminId, {
      title: data.title,
      body: data.body,
      audience: data.audience,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    });
  });

  // ---- DELETE /api/admin/announcements/:id ----
  app.delete<{ Params: { id: string } }>('/announcements/:id', async (request) => {
    const adminId = request.adminId!;
    await deleteAnnouncement(request, adminId, request.params.id);
    return { success: true, id: request.params.id };
  });

  // ---- GET /api/admin/stats ----
  // 概览：5 个总量 KPI + 5 个时间维度扩展（monthlyRevenue / newUsersThisMonth /
  //   expiringSoonCount / failedAiCallsThisMonth / dailySignups30d[]）
  app.get('/stats', async () => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeSubscriptions,
      totalAiCalls,
      adminCount,
      disabledCount,
      monthlyRevenueAgg,
      newUsersThisMonth,
      expiringSoonCount,
      failedAiCallsThisMonth,
      // 30 天每日新增用户数（按 UTC 日期分桶）
      dailySignupsRaw,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.aiUsage.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { disabled: true } }),
      // monthlyRevenue: sum(amountFen where status='paid' this month) / 100 → 元
      prisma.order.aggregate({
        where: { status: 'paid', paidAt: { gte: monthStart } },
        _sum: { amountFen: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      // 7 天内到期但未撤销的订阅数
      prisma.subscription.count({
        where: {
          status: 'active',
          expiresAt: { gt: now, lte: sevenDaysLater },
        },
      }),
      prisma.aiUsage.count({
        where: { success: false, createdAt: { gte: monthStart } },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    // 30 天桶（即使某天 0 也要占位，前端不用补零）
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const u of dailySignupsRaw) {
      const key = u.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const dailySignups30d = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));

    return {
      totalUsers,
      activeSubscriptions,
      totalAiCalls,
      adminCount,
      disabledCount,
      // 扩展字段
      monthlyRevenueYuan: (monthlyRevenueAgg._sum.amountFen ?? 0) / 100,
      newUsersThisMonth,
      expiringSoonCount,
      failedAiCallsThisMonth,
      dailySignups30d,
      generatedAt: now.toISOString(),
    };
  });

  // ---- GET /api/admin/stats/revenue ----
  // 收入时序：按天聚合（30 天）+ 按 plan 拆分
  app.get('/stats/revenue', async (request: FastifyRequest) => {
    const q = request.query as Record<string, string>;
    const days = Math.min(180, Math.max(1, parseInt(q.days) || 30));
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [orders, byPlan] = await Promise.all([
      prisma.order.findMany({
        where: { status: 'paid', paidAt: { gte: since } },
        select: { paidAt: true, plan: true, amountFen: true },
      }),
      prisma.order.groupBy({
        by: ['plan'],
        where: { status: 'paid', paidAt: { gte: since } },
        _sum: { amountFen: true },
        _count: { _all: true },
      }),
    ]);

    // 按天分桶
    const dayBuckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dayBuckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const o of orders) {
      if (!o.paidAt) continue;
      const key = o.paidAt.toISOString().slice(0, 10);
      if (dayBuckets.has(key)) {
        dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + o.amountFen);
      }
    }
    const timeSeries = Array.from(dayBuckets.entries()).map(([date, amountFen]) => ({
      date,
      amountFen,
      amountYuan: amountFen / 100,
    }));

    return {
      timeSeries,
      byPlan: byPlan.map((p) => ({
        plan: p.plan,
        amountFen: p._sum.amountFen ?? 0,
        amountYuan: (p._sum.amountFen ?? 0) / 100,
        count: p._count._all,
      })),
      totalAmountFen: orders.reduce((sum, o) => sum + o.amountFen, 0),
      totalAmountYuan: orders.reduce((sum, o) => sum + o.amountFen, 0) / 100,
      totalCount: orders.length,
      days,
      generatedAt: now.toISOString(),
    };
  });

  // ---- GET /api/admin/audit-log ----
  // 审计日志分页查询：支持按 adminUserId / action / targetType / 时间范围筛选
  app.get('/audit-log', async (request: FastifyRequest) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(0, parseInt(q.page) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit) || 50));

    const where: Record<string, unknown> = {};
    if (q.adminUserId) where.adminUserId = q.adminUserId;
    if (q.action) where.action = q.action;
    if (q.targetType) where.targetType = q.targetType;
    if (q.targetUserId) where.targetUserId = q.targetUserId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.adminActionLog.findMany({
        where,
        skip: page * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, phone: true, email: true, nickname: true } },
        },
      }),
      prisma.adminActionLog.count({ where }),
    ]);

    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}
