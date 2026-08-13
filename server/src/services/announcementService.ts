/**
 * 公告管理服务。
 *
 * 业务规则：
 * - 公告有 startsAt / endsAt 时间窗，仅在窗内对客户端可见。
 * - audience='all' 全员可见；audience='pro' 仅 Pro 订阅用户可见。
 * - 客户端轮询 listActive()，按 startsAt DESC 排序。
 * - 删除是硬删（不像用户内容是软删）——公告发错了就是发错了，让管理员可以重发。
 */

import type { FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { ApiError } from '../errors';
import { writeAuditLog } from './auditLog';

export type AnnouncementAudience = 'all' | 'pro';

export interface ListAnnouncementsFilters {
  page?: number;
  limit?: number;
  audience?: AnnouncementAudience;
}

export async function listAnnouncements(filters: ListAnnouncementsFilters = {}) {
  // 注意：路由层 parseInt(undefined) 会得到 NaN，Prisma skip/take 不接受 NaN，
  // 所以这里必须用 Number.isFinite 过滤（与 adminQueries 的守卫一致）。
  const page = Math.max(0, Number.isFinite(filters.page ?? 0) ? (filters.page ?? 0) : 0);
  const limit = Math.min(100, Math.max(1, Number.isFinite(filters.limit ?? 20) ? (filters.limit ?? 20) : 20));

  const where: Record<string, unknown> = {};
  if (filters.audience) where.audience = filters.audience;

  const [announcements, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      skip: page * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, phone: true, email: true, nickname: true } } },
    }),
    prisma.announcement.count({ where }),
  ]);

  return {
    announcements,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export interface CreateAnnouncementParams {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  startsAt: Date;
  endsAt: Date;
}

export async function createAnnouncement(
  request: FastifyRequest | undefined,
  adminId: string,
  params: CreateAnnouncementParams
) {
  if (params.endsAt.getTime() <= params.startsAt.getTime()) {
    throw ApiError.badRequest('INVALID_PARAMS', 'endsAt 必须晚于 startsAt');
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: params.title,
      body: params.body,
      audience: params.audience,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      createdById: adminId,
    },
  });

  await writeAuditLog(request, adminId, {
    action: 'announcement.create',
    targetType: 'announcement',
    targetId: announcement.id,
    before: null,
    after: {
      title: announcement.title,
      audience: announcement.audience,
      startsAt: announcement.startsAt.toISOString(),
      endsAt: announcement.endsAt.toISOString(),
    },
    note: `${announcement.title}（${announcement.audience}）`,
  });

  return announcement;
}

export async function deleteAnnouncement(
  request: FastifyRequest | undefined,
  adminId: string,
  announcementId: string
) {
  const before = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!before) {
    throw ApiError.notFound('ANNOUNCEMENT_NOT_FOUND', '公告不存在');
  }

  await prisma.announcement.delete({ where: { id: announcementId } });

  await writeAuditLog(request, adminId, {
    action: 'announcement.delete',
    targetType: 'announcement',
    targetId: announcementId,
    before: {
      title: before.title,
      audience: before.audience,
      startsAt: before.startsAt.toISOString(),
      endsAt: before.endsAt.toISOString(),
    },
    after: null,
    note: `删除公告：${before.title}`,
  });
}

/**
 * 公开端点：取当前生效中的公告。
 *
 * - 时间窗过滤：now ∈ [startsAt, endsAt]
 * - audience 过滤：'all' 给所有人；'pro' 仅 Pro 用户能看
 * - 按 startsAt DESC 排序
 */
export async function listActiveAnnouncements(
  audience: AnnouncementAudience = 'all',
  isPro: boolean = false
) {
  // Pro 用户能看到 all + pro 两条线；非 Pro 用户只能看 all
  const audienceFilter: AnnouncementAudience[] = isPro ? ['all', 'pro'] : ['all'];
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      audience: { in: audienceFilter },
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: 'desc' },
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      startsAt: true,
      endsAt: true,
    },
  });
}
