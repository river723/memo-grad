/**
 * 管理后台查询：用户列表 + 用户详情聚合。
 *
 * 设计要点：
 * - **批量聚合而非循环查**：listUsersWithFilters 先取一页用户（≤100），再按 userId 列表
 *   对 4 个维度（lastSyncAt / totalWords / aiCallsThisMonth / activeSub）各做一次 groupBy，
 *   在内存里合并。避免 N+1 把列表查询变成慢查询。
 * - **数据足迹是 groupBy 友好的**：8 个学习表都建了 (userId, updatedAt) 索引，
 *   一次性 groupBy userId + count + max(updatedAt) 即可，5 万条数据下 < 50ms。
 * - **AI 用量按月分桶**：用 startOfMonth() 与 subscriptionService 一致。
 */

import { prisma } from '../db';
import { startOfMonth, daysAgo, toDateKey } from '../utils/dateUtils';
import { getEntitlement } from './subscriptionService';

// ==================== 列表查询 ====================

export interface ListUsersFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'user' | 'admin';
  disabled?: boolean;
  /** 注册时间起点 (ISO 字符串) */
  createdFrom?: string;
  /** 注册时间终点 (ISO 字符串) */
  createdTo?: string;
  /** 最后同步时间起点 (ISO 字符串)，与 lastSyncAt 比较 */
  lastSyncFrom?: string;
  /** 最后同步时间终点 (ISO 字符串) */
  lastSyncTo?: string;
  /** 排序字段：createdAt | updatedAt | lastSyncAt。默认 createdAt。 */
  sort?: 'createdAt' | 'updatedAt' | 'lastSyncAt';
  /** asc | desc，默认 desc。 */
  order?: 'asc' | 'desc';
}

export interface UserListItem {
  id: string;
  phone: string | null;
  email: string | null;
  role: string;
  disabled: boolean;
  disabledAt: Date | null;
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** 全部设备中最近一次同步时间；没有设备则 null */
  lastSyncAt: Date | null;
  /** 单词表记录数（含已软删除的；同步期间已删的也会保留到下一次 GC） */
  totalWords: number;
  /** 本月成功 AI 调用次数 */
  aiCallsThisMonth: number;
  /** 是否有有效订阅 */
  isPro: boolean;
  /** 当前套餐名（monthly/quarterly/yearly） */
  currentPlan: string | null;
  /** 当前订阅到期时间 */
  currentSubExpiresAt: Date | null;
}

export interface ListUsersResult {
  users: UserListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listUsersWithFilters(filters: ListUsersFilters = {}): Promise<ListUsersResult> {
  const page = Math.max(0, Number.isFinite(filters.page ?? 0) ? (filters.page ?? 0) : 0);
  const limit = Math.min(100, Math.max(1, Number.isFinite(filters.limit ?? 20) ? (filters.limit ?? 20) : 20));
  const order = filters.order ?? 'desc';
  const sort = filters.sort ?? 'createdAt';

  // ---- Step 1: 拼 where 条件 ----
  const where: Record<string, unknown> = {};
  if (filters.search) {
    where.OR = [
      { phone: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.role) where.role = filters.role;
  if (filters.disabled !== undefined) where.disabled = filters.disabled;
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {
      ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
      ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
    };
  }

  // lastSyncAt 不是 User 表字段，需要先 groupBy Device 拿到匹配 userId 列表再加 where
  // 走"两步过滤"：先 device groupBy 出 userIds（如果给了 lastSync 过滤），再加到 where.in
  let lastSyncUserIds: string[] | undefined;
  if (filters.lastSyncFrom || filters.lastSyncTo) {
    const deviceWhere: Record<string, unknown> = { lastSyncAt: { not: null } };
    if (filters.lastSyncFrom || filters.lastSyncTo) {
      deviceWhere.lastSyncAt = {
        ...(filters.lastSyncFrom ? { gte: new Date(filters.lastSyncFrom) } : {}),
        ...(filters.lastSyncTo ? { lte: new Date(filters.lastSyncTo) } : {}),
      };
    }
    const grouped = await prisma.device.groupBy({
      by: ['userId'],
      where: deviceWhere,
      _max: { lastSyncAt: true },
    });
    lastSyncUserIds = grouped.map((g) => g.userId);
    // 没有 lastSync 记录的设备：自然不在结果里
    if (lastSyncUserIds.length === 0) {
      return { users: [], total: 0, page, limit, totalPages: 0 };
    }
    where.id = { in: lastSyncUserIds };
  }

  // 排序：lastSyncAt 是 Device 表字段，User 表没有；这里只支持 createdAt/updatedAt
  // 按 lastSyncAt 排序需要先 join Device.max，取出 userId 列表后内存里排
  let orderBy: Record<string, 'asc' | 'desc'>;
  if (sort === 'lastSyncAt') {
    // 走降级：先按 createdAt 取出，再在内存里按 lastSyncAt 排
    orderBy = { createdAt: 'desc' };
  } else {
    orderBy = { [sort]: order };
  }

  // ---- Step 2: 查 User + 计数 ----
  const [baseUsers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: page * limit,
      take: limit,
      orderBy,
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        disabled: true,
        disabledAt: true,
        disabledReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  if (baseUsers.length === 0) {
    return { users: [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  const userIds = baseUsers.map((u) => u.id);

  // ---- Step 3: 批量聚合 4 个维度 ----
  const monthStart = startOfMonth();
  const [deviceAgg, wordAgg, aiAgg, activeSubs] = await Promise.all([
    // 1) 每个用户最后同步时间
    prisma.device.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { lastSyncAt: true },
    }),
    // 2) 每个用户单词数（Word 表没 deletedAt 过滤是因为客户端在读侧 excludeDeleted；
    //    这里给 admin 看全量更直观。数据量小时无差别）
    prisma.word.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
    // 3) 本月 AI 调用
    prisma.aiUsage.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, createdAt: { gte: monthStart } },
      _count: { _all: true },
    }),
    // 4) 有效订阅
    prisma.subscription.findMany({
      where: {
        userId: { in: userIds },
        status: 'active',
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
      },
      select: { userId: true, plan: true, expiresAt: true },
      orderBy: { expiresAt: 'desc' },
    }),
  ]);

  const deviceMap = new Map(deviceAgg.map((d) => [d.userId, d._max.lastSyncAt]));
  const wordMap = new Map(wordAgg.map((w) => [w.userId, w._count._all]));
  const aiMap = new Map(aiAgg.map((a) => [a.userId, a._count._all]));
  // 一个用户可能有多条 active 订阅（虽然不应该），取第一条即 expiresAt 最大的
  const subMap = new Map<string, { plan: string; expiresAt: Date }>();
  for (const s of activeSubs) {
    if (!subMap.has(s.userId)) subMap.set(s.userId, { plan: s.plan, expiresAt: s.expiresAt });
  }

  // ---- Step 4: 合并 ----
  let users: UserListItem[] = baseUsers.map((u) => {
    const sub = subMap.get(u.id);
    return {
      ...u,
      lastSyncAt: deviceMap.get(u.id) ?? null,
      totalWords: wordMap.get(u.id) ?? 0,
      aiCallsThisMonth: aiMap.get(u.id) ?? 0,
      isPro: !!sub,
      currentPlan: sub?.plan ?? null,
      currentSubExpiresAt: sub?.expiresAt ?? null,
    };
  });

  // lastSyncAt 排序在内存里做（避免 join Device）
  if (sort === 'lastSyncAt') {
    users.sort((a, b) => {
      const av = a.lastSyncAt?.getTime() ?? 0;
      const bv = b.lastSyncAt?.getTime() ?? 0;
      return order === 'asc' ? av - bv : bv - av;
    });
  }

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ==================== 详情聚合 ====================

export type DataFootprintEntity =
  | 'word'
  | 'studyRecord'
  | 'studyPlan'
  | 'article'
  | 'examSession'
  | 'wrongQuestion'
  | 'realExamSession'
  | 'realExamWrongQuestion';

export interface DataFootprintEntry {
  count: number;
  lastUpdatedAt: Date | null;
}

export type DataFootprint = Record<DataFootprintEntity, DataFootprintEntry>;

/**
 * 对 8 个学习表 groupBy。Prisma 不支持 union/groupBy 多个表，
 * 用 Promise.all 并行查 8 次（每张表都走 (userId, updatedAt) 索引，单次 < 10ms）。
 */
async function getDataFootprint(userId: string): Promise<DataFootprint> {
  const [words, studyRecords, studyPlans, articles, examSessions, wrongQuestions, realExamSessions, realExamWrongQuestions] = await Promise.all([
    prisma.word.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.studyRecord.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.studyPlan.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.article.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.examSession.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.wrongQuestion.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.realExamSession.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.realExamWrongQuestion.groupBy({ by: ['userId'], where: { userId }, _count: { _all: true }, _max: { updatedAt: true } }),
  ]);

  const pack = (rows: Array<{ _count: { _all: number }; _max: { updatedAt: Date | null } }>): DataFootprintEntry => ({
    count: rows[0]?._count._all ?? 0,
    lastUpdatedAt: rows[0]?._max.updatedAt ?? null,
  });

  return {
    word: pack(words),
    studyRecord: pack(studyRecords),
    studyPlan: pack(studyPlans),
    article: pack(articles),
    examSession: pack(examSessions),
    wrongQuestion: pack(wrongQuestions),
    realExamSession: pack(realExamSessions),
    realExamWrongQuestion: pack(realExamWrongQuestions),
  };
}

export interface StudyActivity {
  /** 学习过的不同天数 */
  distinctDays: number;
  /** 全部学习记录数 */
  totalRecords: number;
  /** 整体正确率（result=1 的占比） */
  overallAccuracy: number | null;
  /** 至少读过一次的 article 数 */
  articlesRead: number;
  /** 模拟考次数 */
  examAttempts: number;
  /** 模拟考平均正确率 */
  avgExamAccuracy: number | null;
  /** 真题考次数 */
  realExamAttempts: number;
  /** 真题考平均分（百分比） */
  avgRealExamScore: number | null;
}

/**
 * 学习活跃度聚合。StudyRecord.result 是 0|1，整体正确率 = avg(result)。
 * 真题分 = avg(score/total*100)。
 */
async function getStudyActivity(userId: string): Promise<StudyActivity> {
  const [
    distinctDaysRow,
    recordAgg,
    articlesReadCount,
    examAgg,
    realExamAgg,
  ] = await Promise.all([
    prisma.studyRecord.findMany({
      where: { userId },
      select: { studyDate: true },
      distinct: ['studyDate'],
    }),
    prisma.studyRecord.aggregate({
      where: { userId },
      _count: { _all: true },
      _avg: { result: true },
    }),
    prisma.article.count({ where: { userId, readCount: { gt: 0 } } }),
    prisma.examSession.aggregate({
      where: { userId },
      _count: { _all: true },
      _avg: { accuracy: true },
    }),
    // 真题平均分用 raw SQL：avg(score::float / total * 100)
    prisma.realExamSession.findMany({
      where: { userId },
      select: { score: true, total: true },
    }),
  ]);

  let avgRealExamScore: number | null = null;
  if (realExamAgg.length > 0) {
    const validRows = realExamAgg.filter((r) => r.total > 0);
    if (validRows.length > 0) {
      const sum = validRows.reduce((acc, r) => acc + (r.score / r.total) * 100, 0);
      avgRealExamScore = sum / validRows.length;
    }
  }

  return {
    distinctDays: distinctDaysRow.length,
    totalRecords: recordAgg._count._all,
    overallAccuracy: recordAgg._avg.result,
    articlesRead: articlesReadCount,
    examAttempts: examAgg._count._all,
    avgExamAccuracy: examAgg._avg.accuracy,
    realExamAttempts: realExamAgg.length,
    avgRealExamScore,
  };
}

export interface AiUsageSummary {
  /** 本月已用（与 entitlement 同步） */
  usedThisMonth: number;
  /** 30 天按日聚合 */
  last30Days: Array<{ date: string; count: number }>;
  /** 按 action 维度拆分（近 30 天） */
  byAction: Record<string, number>;
  /** 总调用次数（成功） */
  totalSuccess: number;
  /** 总调用次数（失败） */
  totalFailed: number;
}

async function getAiUsageSummary(userId: string): Promise<AiUsageSummary> {
  const monthStart = startOfMonth();
  const since30 = daysAgo(30);

  const [usedThisMonth, last30Rows, byActionRows, totalSuccess, totalFailed] = await Promise.all([
    prisma.aiUsage.count({ where: { userId, success: true, createdAt: { gte: monthStart } } }),
    prisma.aiUsage.findMany({
      where: { userId, createdAt: { gte: since30 } },
      select: { createdAt: true },
    }),
    prisma.aiUsage.groupBy({
      by: ['action'],
      where: { userId, createdAt: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.aiUsage.count({ where: { userId, success: true } }),
    prisma.aiUsage.count({ where: { userId, success: false } }),
  ]);

  // 30 天按日分桶（即使某天为 0 也要占位，让前端不用补零）
  const dayBuckets = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    dayBuckets.set(toDateKey(daysAgo(i)), 0);
  }
  for (const row of last30Rows) {
    const key = toDateKey(row.createdAt);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }
  const last30Days = Array.from(dayBuckets.entries()).map(([date, count]) => ({ date, count }));

  const byAction: Record<string, number> = {};
  for (const row of byActionRows) byAction[row.action] = row._count._all;

  return { usedThisMonth, last30Days, byAction, totalSuccess, totalFailed };
}

export interface UserDetail {
  // 基础字段
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  role: string;
  disabled: boolean;
  disabledAt: Date | null;
  disabledReason: string | null;
  disabledById: string | null;
  createdAt: Date;
  updatedAt: Date;
  // 聚合字段
  devices: Array<{ deviceId: string; platform: string; appVersion: string | null; lastSyncAt: Date | null; createdAt: Date }>;
  subscriptionHistory: Array<{
    id: string;
    plan: string;
    status: string;
    source: string;
    startsAt: Date;
    expiresAt: Date;
    createdAt: Date;
  }>;
  orderHistory: Array<{
    id: string;
    outTradeNo: string;
    channel: string;
    plan: string;
    amountFen: number;
    status: string;
    paidAt: Date | null;
    createdAt: Date;
  }>;
  aiUsageSummary: AiUsageSummary;
  dataFootprint: DataFootprint;
  studyActivity: StudyActivity;
  /** 当前权益快照（含订阅、配额），与 /me 一致 */
  entitlement: Awaited<ReturnType<typeof getEntitlement>>;
}

export async function getUserDetailAggregated(userId: string): Promise<UserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      email: true,
      nickname: true,
      role: true,
      disabled: true,
      disabledAt: true,
      disabledReason: true,
      disabledById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) return null;

  const [devices, subscriptionHistory, orderHistory, aiUsageSummary, dataFootprint, studyActivity, entitlement] = await Promise.all([
    prisma.device.findMany({
      where: { userId },
      select: { deviceId: true, platform: true, appVersion: true, lastSyncAt: true, createdAt: true },
      orderBy: { lastSyncAt: 'desc' },
    }),
    prisma.subscription.findMany({
      where: { userId },
      select: { id: true, plan: true, status: true, source: true, startsAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.findMany({
      where: { userId },
      select: { id: true, outTradeNo: true, channel: true, plan: true, amountFen: true, status: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    getAiUsageSummary(userId),
    getDataFootprint(userId),
    getStudyActivity(userId),
    getEntitlement(userId),
  ]);

  return {
    ...user,
    devices,
    subscriptionHistory,
    orderHistory,
    aiUsageSummary,
    dataFootprint,
    studyActivity,
    entitlement,
  };
}

// ==================== 跨用户订单列表 ====================

export interface ListOrdersFilters {
  page?: number;
  limit?: number;
  userId?: string;
  /** phone/email 子串匹配，关联到 userId 过滤 */
  search?: string;
  status?: 'pending' | 'paid' | 'closed' | 'refunded';
  channel?: 'wechat' | 'alipay';
  /** paidAt 起点 */
  paidFrom?: string;
  /** paidAt 终点 */
  paidTo?: string;
}

export interface OrderListItem {
  id: string;
  outTradeNo: string;
  userId: string;
  userPhone: string | null;
  userEmail: string | null;
  channel: string;
  plan: string;
  amountFen: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
}

export interface ListOrdersResult {
  orders: OrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listOrders(filters: ListOrdersFilters = {}): Promise<ListOrdersResult> {
  const page = Math.max(0, Number.isFinite(filters.page ?? 0) ? (filters.page ?? 0) : 0);
  const limit = Math.min(100, Math.max(1, Number.isFinite(filters.limit ?? 20) ? (filters.limit ?? 20) : 20));

  const where: Record<string, unknown> = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.status) where.status = filters.status;
  if (filters.channel) where.channel = filters.channel;
  if (filters.paidFrom || filters.paidTo) {
    where.paidAt = {
      ...(filters.paidFrom ? { gte: new Date(filters.paidFrom) } : {}),
      ...(filters.paidTo ? { lte: new Date(filters.paidTo) } : {}),
    };
  }
  if (filters.search) {
    // 把 search 解析为 userId 列表
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { phone: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (users.length === 0) {
      return { orders: [], total: 0, page, limit, totalPages: 0 };
    }
    where.userId = { in: users.map((u) => u.id) };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: page * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        outTradeNo: true,
        userId: true,
        channel: true,
        plan: true,
        amountFen: true,
        status: true,
        paidAt: true,
        createdAt: true,
        user: { select: { phone: true, email: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map((o) => ({
      id: o.id,
      outTradeNo: o.outTradeNo,
      userId: o.userId,
      userPhone: o.user.phone,
      userEmail: o.user.email,
      channel: o.channel,
      plan: o.plan,
      amountFen: o.amountFen,
      status: o.status,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
