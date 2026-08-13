/**
 * 后台管理 API 客户端。
 *
 * 独立于 src/services/ApiClient.ts 的好处：
 * - 类型安全：admin 专用类型集中在 admin/types.ts
 * - 复用底层 token / 401 刷新逻辑
 * - 方便后续切到独立域名或加 admin-only header
 *
 * 所有方法返回 Promise<T>，失败抛 ApiClientError。
 */

import { api, ApiClientError } from './ApiClient';
import type {
  ListUsersParams, ListUsersResult, UserDetail, AdminStats, AdminRevenueStats,
  ListOrdersParams, ListOrdersResult,
  ListAuditLogParams, ListAuditLogResult,
  Announcement, CreateAnnouncementParams,
} from '../screens/admin/types';

function qs(params: object): string {
  const entries = Object.entries(params as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export const AdminApi = {
  // ---- 用户 ----
  listUsers: (params: ListUsersParams = {}) =>
    api.get<ListUsersResult>(`/api/admin/users${qs(params)}`),

  getUser: (userId: string) =>
    api.get<UserDetail>(`/api/admin/users/${userId}`),

  setDisabled: (userId: string, disabled: boolean, reason?: string) =>
    api.patch(`/api/admin/users/${userId}`, { disabled, reason }),

  setRole: (userId: string, role: 'user' | 'admin') =>
    api.patch(`/api/admin/users/${userId}`, { role }),

  banUser: (userId: string) =>
    api.delete(`/api/admin/users/${userId}`),

  resetPassword: (userId: string, newPassword: string) =>
    api.post(`/api/admin/users/${userId}/reset-password`, { newPassword }),

  forceLogout: (userId: string) =>
    api.post(`/api/admin/users/${userId}/force-logout`),

  resetAiQuota: (userId: string) =>
    api.post(`/api/admin/users/${userId}/reset-ai-quota`),

  // ---- 订阅 ----
  grantSubscription: (userId: string, plan: 'monthly' | 'quarterly' | 'yearly', days: number, source: 'manual' | 'gift', note?: string) =>
    api.post(`/api/admin/users/${userId}/grant-subscription`, { plan, days, source, note }),

  revokeSubscription: (userId: string, note?: string) =>
    api.post(`/api/admin/users/${userId}/revoke-subscription`, { note }),

  refundOrder: (userId: string, outTradeNo: string, reason: string) =>
    api.post(`/api/admin/users/${userId}/refund-order`, { outTradeNo, reason }),

  // ---- 订单 ----
  listOrders: (params: ListOrdersParams = {}) =>
    api.get<ListOrdersResult>(`/api/admin/orders${qs(params)}`),

  // ---- 审计 ----
  listAuditLog: (params: ListAuditLogParams = {}) =>
    api.get<ListAuditLogResult>(`/api/admin/audit-log${qs(params)}`),

  // ---- 统计 ----
  getStats: () =>
    api.get<AdminStats>('/api/admin/stats'),

  getRevenue: (days: number = 30) =>
    api.get<AdminRevenueStats>(`/api/admin/stats/revenue?days=${days}`),

  // ---- 公告 ----
  listAnnouncements: (params: { page?: number; limit?: number; audience?: 'all' | 'pro' } = {}) =>
    api.get<{ announcements: Announcement[]; total: number; page: number; limit: number; totalPages: number }>(`/api/admin/announcements${qs(params)}`),

  createAnnouncement: (params: CreateAnnouncementParams) =>
    api.post<Announcement>('/api/admin/announcements', params),

  deleteAnnouncement: (id: string) =>
    api.delete<{ success: boolean; id: string }>(`/api/admin/announcements/${id}`),
};

export { ApiClientError };
