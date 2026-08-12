/**
 * 认证路由：验证码登录 / 邮箱密码登录 / 刷新 / 登出 / 当前用户。
 *
 * 手机号验证码是主路径（国内用户无需记密码、无需找回流程）；
 * 邮箱密码作为备选，服务海外与桌面端用户。
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { ApiError } from '../errors';
import {
  createVerificationCode,
  consumeVerificationCode,
  checkSendRateLimit,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/tokenService';
import { sendVerificationCode } from '../services/smsService';
import { getEntitlement } from '../services/subscriptionService';
import { hashPassword, verifyPassword } from '../services/passwordService';
import { parseBody } from '../utils/parseBody';

/** 中国大陆手机号。国际号码等接入海外支付时再扩展。 */
const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确');
const codeSchema = z.string().regex(/^\d{6}$/, '验证码应为 6 位数字');

const sendCodeBody = z.object({
  phone: phoneSchema,
  purpose: z.enum(['login', 'bind', 'reset']).default('login'),
});

const loginBody = z.object({
  phone: phoneSchema,
  code: codeSchema,
  deviceId: z.string().min(1).max(128).optional(),
  platform: z.enum(['ios', 'android', 'web', 'desktop']).optional(),
  appVersion: z.string().max(32).optional(),
});

const emailLoginBody = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位').max(128),
  deviceId: z.string().min(1).max(128).optional(),
  platform: z.enum(['ios', 'android', 'web', 'desktop']).optional(),
});

const refreshBody = z.object({
  refreshToken: z.string().min(10),
});

/**
 * 密码哈希：scrypt（Node 内置，无需额外依赖）。
 * 格式 `scrypt$<salt-hex>$<hash-hex>`，便于将来换算法时识别旧格式。
 * 实现已抽到 services/passwordService.ts。
 */

export default async function authRoutes(app: FastifyInstance) {
  /** 记录/更新登录设备，供"最近登录设备"与同步游标使用。 */
  async function upsertDevice(
    userId: string,
    deviceId?: string,
    platform?: string,
    appVersion?: string
  ) {
    if (!deviceId) return;
    await prisma.device.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, platform: platform ?? 'unknown', appVersion },
      update: { platform: platform ?? 'unknown', appVersion },
    });
  }

  /** 统一签发 access + refresh 并组装登录响应。 */
  async function issueSession(
    userId: string,
    deviceId?: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const accessToken = app.jwt.sign({ sub: userId, typ: 'access' });
    const { token: refreshToken } = await issueRefreshToken(userId, deviceId);
    return { accessToken, refreshToken, expiresIn: config.jwt.accessTtl };
  }

  // ---------- 发送验证码 ----------
  app.post('/auth/send-code', async (request) => {
    const { phone, purpose } = parseBody(sendCodeBody, request.body);

    const rate = await checkSendRateLimit(phone, purpose);
    if (!rate.allowed) {
      throw ApiError.tooManyRequests(
        rate.reason === 'DAILY_LIMIT' ? 'SMS_DAILY_LIMIT' : 'SMS_COOLDOWN',
        rate.reason === 'DAILY_LIMIT'
          ? '今日验证码发送次数已达上限，请稍后再试'
          : `请 ${rate.retryAfterSeconds} 秒后再试`,
        { retryAfterSeconds: rate.retryAfterSeconds }
      );
    }

    const { code, expiresAt } = await createVerificationCode(phone, purpose);
    const sendResult = await sendVerificationCode(phone, code);

    return {
      sent: true,
      expiresAt: expiresAt.toISOString(),
      cooldownSeconds: config.sms.resendCooldownSeconds,
      // 仅开发模式返回，方便自动化测试；生产为 undefined 不会出现在 JSON 里
      ...(sendResult.devCode ? { devCode: sendResult.devCode } : {}),
    };
  });

  // ---------- 验证码登录（免注册：首次登录即建号）----------
  app.post('/auth/login', async (request) => {
    const { phone, code, deviceId, platform, appVersion } = parseBody(loginBody, request.body);

    await consumeVerificationCode(phone, 'login', code);

    // 免注册：验证码通过即建号。多一个"注册"步骤只会降低转化，
    // 且手机号本身已完成所有权验证。
    let user = await prisma.user.findUnique({ where: { phone } });
    let isNewUser = false;
    if (!user) {
      user = await prisma.user.create({ data: { phone } });
      isNewUser = true;
    }
    if (user.disabled) {
      throw ApiError.forbidden('ACCOUNT_DISABLED', '账号已被停用');
    }

    await upsertDevice(user.id, deviceId, platform, appVersion);
    const session = await issueSession(user.id, deviceId);
    const entitlement = await getEntitlement(user.id);

    return {
      ...session,
      isNewUser,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      entitlement,
    };
  });

  // ---------- 邮箱密码登录（备选通道）----------
  app.post('/auth/login-email', async (request) => {
    const { email, password, deviceId, platform } = parseBody(emailLoginBody, request.body);

    const user = await prisma.user.findUnique({ where: { email } });
    // 邮箱不存在与密码错误返回同一个错误：否则接口变成账号枚举器
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw ApiError.unauthorized('INVALID_CREDENTIALS', '邮箱或密码不正确');
    }
    if (user.disabled) {
      throw ApiError.forbidden('ACCOUNT_DISABLED', '账号已被停用');
    }

    await upsertDevice(user.id, deviceId, platform);
    const session = await issueSession(user.id, deviceId);
    const entitlement = await getEntitlement(user.id);

    return {
      ...session,
      isNewUser: false,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      entitlement,
    };
  });

  // ---------- 邮箱注册 ----------
  app.post('/auth/register-email', async (request) => {
    const { email, password, deviceId, platform } = parseBody(emailLoginBody, request.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw ApiError.badRequest('EMAIL_TAKEN', '该邮箱已注册');
    }

    const user = await prisma.user.create({
      data: { email, passwordHash: hashPassword(password) },
    });

    await upsertDevice(user.id, deviceId, platform);
    const session = await issueSession(user.id, deviceId);
    const entitlement = await getEntitlement(user.id);

    return {
      ...session,
      isNewUser: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      entitlement,
    };
  });

  // ---------- 刷新令牌 ----------
  app.post('/auth/refresh', async (request) => {
    const { refreshToken } = parseBody(refreshBody, request.body);
    const rotated = await rotateRefreshToken(refreshToken);

    return {
      accessToken: app.jwt.sign({ sub: rotated.userId, typ: 'access' }),
      // 轮换后必须返回新的 refresh token：旧的已失效
      refreshToken: rotated.token,
      expiresIn: config.jwt.accessTtl,
    };
  });

  // ---------- 登出 ----------
  app.post('/auth/logout', async (request) => {
    const parsed = refreshBody.safeParse(request.body);
    // 登出保持幂等：即使没带 token 或 token 已失效也返回成功，
    // 否则客户端会卡在"退不出去"的状态。
    if (parsed.success) {
      await revokeRefreshToken(parsed.data.refreshToken);
    }
    return { success: true };
  });

  // ---------- 当前用户 ----------
  app.get('/me', { preHandler: app.authGuard }, async (request) => {
    const userId = request.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true, nickname: true, role: true, createdAt: true },
    });
    if (!user) {
      throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
    }

    const entitlement = await getEntitlement(userId);
    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      entitlement,
    };
  });
}
