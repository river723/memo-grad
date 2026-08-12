/**
 * 共享的请求体验证工具。
 *
 * 之前 parseBody 散落在 auth.ts 里（line 73-84）。Phase A 起所有路由都该用同一个，
 * 避免每个文件各写一份 Zod 错误处理（错误信息、details.path 结构会漂移）。
 */

import type { z } from 'zod';
import { ApiError } from '../errors';

/**
 * 把 zod 校验失败转成统一的 ApiError：
 *   code: VALIDATION_FAILED
 *   message: 第一个 issue 的 message（中文友好）
 *   details: { path: 'a.b.c' }  字段路径供客户端定位
 *
 * 成功时直接返回推断后的类型 data，不再是 unknown。
 */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw ApiError.badRequest(
      'VALIDATION_FAILED',
      first?.message || '请求参数不合法',
      { path: first?.path?.join('.') }
    );
  }
  return result.data;
}
