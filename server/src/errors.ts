/**
 * 统一的 API 错误类型与错误响应格式。
 *
 * 客户端要能靠稳定的 `code` 做分支（比如 402 QUOTA_EXCEEDED 弹订阅引导），
 * 靠 message 文本匹配是脆的。所以每个业务错误都带机器可读的 code。
 */

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    /** 附加信息，如配额剩余量、重试等待秒数 */
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code: string, message: string) {
    return new ApiError(401, code, message);
  }

  static forbidden(code: string, message: string) {
    return new ApiError(403, code, message);
  }

  static notFound(code: string, message: string) {
    return new ApiError(404, code, message);
  }

  static tooManyRequests(code: string, message: string, details?: Record<string, unknown>) {
    return new ApiError(429, code, message, details);
  }

  /**
   * 402 专用于"已认证但未付费/超配额"。
   * 与 403 区分开，前端据此弹订阅页而非"无权限"提示。
   */
  static paymentRequired(code: string, message: string, details?: Record<string, unknown>) {
    return new ApiError(402, code, message, details);
  }
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function toErrorBody(err: ApiError): ErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}
