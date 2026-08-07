/**
 * 令牌与验证码的签发、校验、撤销。
 *
 * 设计要点：
 * - Access token 短（15min）且无状态，纯 JWT 校验，不查库，保证 AI 代理这类
 *   高频接口不被数据库拖慢。
 * - Refresh token 长（30天）且**有状态**：哈希后存库形成白名单，登出即删除。
 *   纯无状态的 refresh token 无法撤销，账号被盗后只能等 30 天自然过期。
 * - 存进数据库的一律是哈希：验证码和 refresh token 明文入库，等于库一旦泄露
 *   攻击者可直接登录任意账号。
 * - Refresh 时轮换（rotation）：旧 token 立即失效，换发新的。这样即使 refresh
 *   token 泄露，也只有一次使用窗口。
 */

import crypto from 'node:crypto';
import { prisma } from '../db';
import { config } from '../config';
import { ApiError } from '../errors';

/** SHA-256 哈希。用于 refresh token 与验证码——它们都是高熵随机值，
 *  不需要 bcrypt/argon2 的慢哈希（那是为了对抗低熵的用户密码）。 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** 生成高熵 refresh token（256 bit）。 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * 生成 6 位数字验证码。
 * 用 randomInt 而非 Math.random：验证码是安全凭据，可预测的伪随机
 * 意味着攻击者能算出别人的验证码。
 */
export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** 恒定时间比较，避免通过响应时间差逐字符猜测凭据。 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface AccessTokenPayload {
  sub: string;      // userId
  typ: 'access';
}

/** 签发 refresh token 并写入白名单，返回明文（仅此一次可见）。 */
export async function issueRefreshToken(
  userId: string,
  deviceId?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000
  );

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      deviceId: deviceId ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * 校验 refresh token 并轮换：旧的标记撤销，签发新的。
 *
 * 注意这里不做"检测到已撤销 token 被重用就把该用户全部 token 作废"的
 * 激进策略——弱网下客户端重试很容易触发误判，把正常用户踢下线。
 */
export async function rotateRefreshToken(
  rawToken: string
): Promise<{ userId: string; token: string; expiresAt: Date }> {
  const tokenHash = sha256(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing || existing.revokedAt) {
    throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', '登录状态已失效，请重新登录');
  }
  if (existing.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('REFRESH_TOKEN_EXPIRED', '登录状态已过期，请重新登录');
  }
  if (existing.user.disabled) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', '账号已被停用');
  }

  const next = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000
  );

  // 事务保证：不会出现"旧的撤销了但新的没建"导致用户被登出
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: sha256(next),
        deviceId: existing.deviceId,
        expiresAt,
      },
    }),
  ]);

  return { userId: existing.userId, token: next, expiresAt };
}

/** 撤销单个 refresh token（登出当前设备）。 */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  // updateMany 而非 update：token 不存在时不该抛错，登出应当幂等
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 撤销某用户全部 refresh token（改密码、账号被盗时用）。 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

// ==================== 验证码 ====================

/** 单个验证码允许的最大校验次数，超过即作废，防爆破。 */
const MAX_CODE_ATTEMPTS = 5;

/**
 * 创建验证码。返回明文供开发模式回显 / 生产环境交给短信通道。
 * 同时把该 target 之前未使用的验证码全部作废——否则用户连续点两次发送，
 * 两个验证码都有效，等于把爆破空间翻倍。
 */
export async function createVerificationCode(
  target: string,
  purpose: string
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + config.sms.codeTtlSeconds * 1000);

  await prisma.$transaction([
    prisma.verificationCode.updateMany({
      where: { target, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationCode.create({
      data: { target, purpose, codeHash: sha256(code), expiresAt },
    }),
  ]);

  return { code, expiresAt };
}

/**
 * 校验并消费验证码。成功后立即标记已用，保证一次性。
 */
export async function consumeVerificationCode(
  target: string,
  purpose: string,
  code: string
): Promise<void> {
  const record = await prisma.verificationCode.findFirst({
    where: { target, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw ApiError.badRequest('CODE_NOT_FOUND', '验证码不存在或已使用，请重新获取');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('CODE_EXPIRED', '验证码已过期，请重新获取');
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    // 作废掉，迫使重新获取
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    throw ApiError.tooManyRequests('CODE_TOO_MANY_ATTEMPTS', '验证码错误次数过多，请重新获取');
  }

  if (!safeEqual(record.codeHash, sha256(code))) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw ApiError.badRequest('CODE_INCORRECT', '验证码不正确');
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
}

/**
 * 发送频率控制。返回需等待的秒数，0 表示可以发送。
 * 直接查库而不用 Redis：验证码发送是低频操作，一次索引查询足够，
 * 少一个中间件依赖就少一个故障点。
 */
export async function checkSendRateLimit(
  target: string,
  purpose: string
): Promise<{ allowed: boolean; retryAfterSeconds: number; reason?: string }> {
  const latest = await prisma.verificationCode.findFirst({
    where: { target, purpose },
    orderBy: { createdAt: 'desc' },
  });

  if (latest) {
    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
    const cooldown = config.sms.resendCooldownSeconds;
    if (elapsed < cooldown) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(cooldown - elapsed),
        reason: 'COOLDOWN',
      };
    }
  }

  // 单日上限：防止有人拿别人手机号当短信轰炸机
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dailyCount = await prisma.verificationCode.count({
    where: { target, createdAt: { gte: since } },
  });
  if (dailyCount >= config.sms.dailyLimitPerTarget) {
    return { allowed: false, retryAfterSeconds: 3600, reason: 'DAILY_LIMIT' };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
