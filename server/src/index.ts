/**
 * 服务入口：装配插件、注册路由、优雅关闭。
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { prisma } from './db';
import { ApiError, toErrorBody } from './errors';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import adminRoutes from './routes/adminRoutes';
import aiRoutes from './routes/aiRoutes';
import paymentRoutes from './routes/paymentRoutes';
import syncRoutes from './routes/syncRoutes';

export async function buildApp() {
  const app = Fastify({
    logger: config.isProduction
      ? { level: 'info' }
      : { level: 'info', transport: { target: 'pino-pretty' } },
    // 客户端可传 x-request-id 便于端到端追踪
    requestIdHeader: 'x-request-id',
    // 请求体上限：学习数据同步可能一次推送数千条记录
    bodyLimit: 8 * 1024 * 1024,
  });

  // ---- CORS ----
  await app.register(cors, {
    origin: (origin, cb) => {
      // 无 origin 的请求（curl、移动端原生、同源）直接放行
      if (!origin) return cb(null, true);
      if (config.corsOrigins.length === 0) {
        // 未配置白名单时，开发环境放行、生产环境拒绝——
        // 生产忘配 CORS_ORIGINS 应当暴露为明确错误，而不是静默全放行。
        return cb(null, !config.isProduction);
      }
      cb(null, config.corsOrigins.includes(origin));
    },
    credentials: true,
  });

  // ---- 全局限流 ----
  // 兜底防护。验证码、登录、AI 这些敏感端点在各自路由上另有更严的限制。
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req as { userId?: string }).userId || req.ip,
  });

  await app.register(authPlugin);

  // ---- 统一错误处理 ----
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      // 4xx 是预期内的业务分支，用 info 级别，避免把日志刷满
      request.log.info(
        { code: error.code, statusCode: error.statusCode },
        error.message
      );
      return reply.status(error.statusCode).send(toErrorBody(error));
    }

    // @fastify/rate-limit 抛的错
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send(
        toErrorBody(
          ApiError.tooManyRequests('RATE_LIMITED', '请求过于频繁，请稍后再试')
        )
      );
    }

    // 未预期的错误：完整记录，但不把内部细节返回给客户端
    request.log.error({ err: error }, '未处理的服务端错误');
    return reply.status(500).send(
      toErrorBody(new ApiError(500, 'INTERNAL_ERROR', '服务器内部错误'))
    );
  });

  // ---- 健康检查 ----
  // 探针要真的查一次库：进程活着但数据库连不上时，这个接口必须报不健康，
  // 否则编排平台会把流量继续打进来。
  app.get('/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', time: new Date().toISOString() };
    } catch (err) {
      reply.status(503);
      return { status: 'degraded', database: 'unreachable' };
    }
  });

  await app.register(authRoutes);
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(aiRoutes, { prefix: '/api/ai' });
  await app.register(paymentRoutes, { prefix: '/api/pay' });
  await app.register(syncRoutes, { prefix: '/api/sync' });

  return app;
}

async function start() {
  const app = await buildApp();

  // 优雅关闭：先停止接收新请求，再断开数据库
  const shutdown = async (signal: string) => {
    app.log.info(`收到 ${signal}，开始优雅关闭`);
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, '关闭过程出错');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`MemoGrad 后端已启动 (${config.nodeEnv})`);
  } catch (err) {
    app.log.error({ err }, '启动失败');
    process.exit(1);
  }
}

// 仅在直接运行时启动；被测试 import 时只导出 buildApp
if (require.main === module) {
  void start();
}
