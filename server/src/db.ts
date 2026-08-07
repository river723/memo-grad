/**
 * Prisma 客户端单例。
 *
 * 开发环境用 globalThis 缓存：tsx watch 每次热重载都会重新执行模块，
 * 不缓存会不断新建连接池，很快耗尽 Postgres 的连接数上限。
 */

import { PrismaClient } from '@prisma/client';
import { config } from './config';

declare global {
  // eslint-disable-next-line no-var
  var __memogradPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__memogradPrisma ??
  new PrismaClient({
    log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!config.isProduction) {
  globalThis.__memogradPrisma = prisma;
}
