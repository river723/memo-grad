/**
 * 后台管理相关类型。
 * 与 server/src/services/adminQueries.ts、subscriptionAdmin.ts 等保持一致。
 */

export type AdminRole = 'user' | 'admin';

export interface UserListItem {
  id: string;
  phone: string | null;
  email: string | null;
  role: AdminRole;
  disabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  totalWords: number;
  aiCallsThisMonth: number;
  isPro: boolean;
  currentPlan: string | null;
  currentSubExpiresAt: string | null;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: AdminRole;
  disabled?: boolean;
  createdFrom?: string;
  createdTo?: string;
  lastSyncFrom?: string;
  lastSyncTo?: string;
  sort?: 'createdAt' | 'updatedAt' | 'lastSyncAt';
  order?: 'asc' | 'desc';
}

export interface ListUsersResult {
  users: UserListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Entitlement {
  isPro: boolean;
  plan: string | null;
  status: 'active' | 'expired' | 'none';
  expiresAt: string | null;
  quota: { monthlyLimit: number; used: number; remaining: number };
}

export interface StudyActivity {
  distinctDays: number;
  totalRecords: number;
  overallAccuracy: number | null;
  articlesRead: number;
  examAttempts: number;
  avgExamAccuracy: number | null;
  realExamAttempts: number;
  avgRealExamScore: number | null;
}

export interface DataFootprintEntry {
  count: number;
  lastUpdatedAt: string | null;
}

export type DataFootprint = Record<
  'word' | 'studyRecord' | 'studyPlan' | 'article' | 'examSession' | 'wrongQuestion' | 'realExamSession' | 'realExamWrongQuestion',
  DataFootprintEntry
>;

export interface AiUsageSummary {
  usedThisMonth: number;
  last30Days: Array<{ date: string; count: number }>;
  byAction: Record<string, number>;
  totalSuccess: number;
  totalFailed: number;
}

export interface UserDetail extends UserListItem {
  nickname: string | null;
  disabledById: string | null;
  devices: Array<{
    deviceId: string;
    platform: string;
    appVersion: string | null;
    lastSyncAt: string | null;
    createdAt: string;
  }>;
  subscriptionHistory: Array<{
    id: string;
    plan: string;
    status: string;
    source: string;
    startsAt: string;
    expiresAt: string;
    createdAt: string;
  }>;
  orderHistory: Array<{
    id: string;
    outTradeNo: string;
    channel: string;
    plan: string;
    amountFen: number;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }>;
  aiUsageSummary: AiUsageSummary;
  dataFootprint: DataFootprint;
  studyActivity: StudyActivity;
  entitlement: Entitlement;
}

export interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalAiCalls: number;
  adminCount: number;
  disabledCount: number;
  // 扩展字段
  monthlyRevenueYuan: number;
  newUsersThisMonth: number;
  expiringSoonCount: number;
  failedAiCallsThisMonth: number;
  dailySignups30d: Array<{ date: string; count: number }>;
  generatedAt: string;
}

export interface AdminRevenueStats {
  timeSeries: Array<{ date: string; amountFen: number; amountYuan: number }>;
  byPlan: Array<{ plan: string; amountFen: number; amountYuan: number; count: number }>;
  totalAmountFen: number;
  totalAmountYuan: number;
  totalCount: number;
  days: number;
  generatedAt: string;
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
  status: 'pending' | 'paid' | 'closed' | 'refunded';
  paidAt: string | null;
  createdAt: string;
}

export interface ListOrdersParams {
  page?: number;
  limit?: number;
  userId?: string;
  search?: string;
  status?: OrderListItem['status'];
  channel?: 'wechat' | 'alipay';
  paidFrom?: string;
  paidTo?: string;
}

export interface ListOrdersResult {
  orders: OrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminActionLog {
  id: string;
  adminUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetUserId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  note: string | null;
  createdAt: string;
  admin: { id: string; phone: string | null; email: string | null; nickname: string | null } | null;
}

export interface ListAuditLogParams {
  page?: number;
  limit?: number;
  adminUserId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
}

export interface ListAuditLogResult {
  logs: AdminActionLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'pro';
  startsAt: string;
  endsAt: string;
  createdById: string | null;
  createdAt: string;
}

export interface CreateAnnouncementParams {
  title: string;
  body: string;
  audience: 'all' | 'pro';
  startsAt: string;
  endsAt: string;
}
