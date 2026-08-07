/**
 * 统一的 API 客户端。
 *
 * 网络版改造后，前端不再直连 DeepSeek API，所有请求（认证、AI 代理、
 * 云同步）都走这个实例。职责：
 * - 自动注入 JWT access token
 * - 401 时自动尝试 refresh 一次（全局锁 + 队列，防止并发请求同时刷新）
 * - 将服务端统一错误格式 `{ error: { code, message, details } }` 转成
 *   前端友好的 ApiClientError，业务层可以按 code 做分支。
 *
 * 与 axios 解耦是为了让 AuthProvider 的 token 读写不依赖 axios 实例——
 * axios 拦截器是对类实例的闭包修改，多实例或多注册会变成时序炸弹。
 * 这里用 fetch 做底层，行为完全显式。
 *
 * 注意：这个模块刻意不依赖 React / hooks / context，AuthProvider 通过
 * setCredentials() 注入 token，API 调用纯函数可测试。
 */

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type TokenStore = {
  accessToken: string | null;
  refreshToken: string | null;
};

type TokenGetter = () => TokenStore;
type CredentialsSetter = (accessToken: string | null, refreshToken: string | null) => void | Promise<void>;

let tokenStore: TokenStore = { accessToken: null, refreshToken: null };
let getTokensFn: TokenGetter = () => tokenStore;
let setCredentialsFn: CredentialsSetter = () => {};

/**
 * 注册 token 读写能力。AuthProvider 初始化时调用，使得登录/刷新
 * 后的新 token 可以持久化到 AsyncStorage 并同步到内存。
 */
export function registerTokenStore(
  getTokens: TokenGetter,
  setTokens: CredentialsSetter
) {
  getTokensFn = getTokens;
  setCredentialsFn = setTokens;
}

let setCredentials: CredentialsSetter = (at, rt) => { setCredentialsFn(at, rt); };

const BASE_URL = __DEV__ ? 'http://127.0.0.1:3000' : 'https://api.memograd.cn';

/** 刷新锁：同一时刻只允许一个请求在刷新，其他请求排队等结果。 */
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(initial: string | null): Promise<boolean> {
  if (!initial) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: initial }),
        });
        if (!res.ok) {
          // 刷新失败：清除凭据，让用户重新登录
          setCredentials(null, null);
          return false;
        }
        const data = await res.json();
        setCredentials(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        // 2s 冷却：防止 fail-fast 循环（服务端挂了，每个请求都独立失败，
        // 没有这把锁则每个请求各自尝试 refresh 一次 = 请求数翻倍）
        setTimeout(() => { refreshPromise = null; }, 2000);
      }
    })();
  }
  return refreshPromise;
}

export interface ApiClientOptions {
  /** 失败重试次数（不含 refresh 那次）。默认 1。 */
  retries?: number;
  /** 超时毫秒。默认 30000。 */
  timeout?: number;
  /** 跳过认证头（用于 /auth/* 等不需要 token 的端点）。 */
  noAuth?: boolean;
}

/**
 * 发起 API 请求。
 *
 * 自动注入 JWT，遇到 401 自动 refresh 并重试一次。重试后仍旧 401 则抛出
 * ApiClientError，调用方可据此跳转登录页。
 */
export async function apiRequest<T = any>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiClientOptions = {}
): Promise<T> {
  const { retries = 1, timeout = 30000, noAuth = false } = options;

  const doFetch = async (attempt: number, refreshToken: string | null): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(!noAuth && getTokensFn().accessToken
            ? { authorization: `Bearer ${getTokensFn().accessToken}` }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ApiClientError(0, 'TIMEOUT', `请求超时（${timeout}ms）`);
      }
      if (attempt < retries) {
        // 网络层面的失败可以重试（DNS 抖动、TCP 握手失败等）
        // 简单延迟避免瞬时风暴
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return doFetch(attempt + 1, refreshToken);
      }
      throw new ApiClientError(0, 'NETWORK_ERROR', `网络错误: ${err.message}`);
    }
  };

  let res = await doFetch(0, getTokensFn().refreshToken);

  // 401 且不是 auth 端点 → 尝试 refresh 后重试一次
  if (res.status === 401 && !noAuth && getTokensFn().refreshToken) {
    const refreshed = await tryRefresh(getTokensFn().refreshToken);
    if (refreshed) {
      res = await doFetch(0, getTokensFn().refreshToken);
    }
  }

  // 即使 refresh 后仍是 401，也可能返回了业务 JSON（如 ACCOUNT_DISABLED）
  if (!res.ok) {
    const error = await parseErrorBody(res);
    throw error;
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

async function parseErrorBody(res: Response): Promise<ApiClientError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 无 JSON 响应体（网关返回的非 JSON HTML） */
  }

  if (res.status === 429) {
    return new ApiClientError(
      res.status,
      body?.error?.code || 'RATE_LIMITED',
      body?.error?.message || '请求过于频繁',
      body?.error?.details
    );
  }

  if (res.status === 402) {
    return new ApiClientError(
      res.status,
      body?.error?.code || 'PAYMENT_REQUIRED',
      body?.error?.message || '该功能需要订阅',
      body?.error?.details
    );
  }

  return new ApiClientError(
    res.status,
    body?.error?.code || 'UNKNOWN_ERROR',
    body?.error?.message || `服务器错误 (${res.status})`,
    body?.error?.details
  );
}

/** 便捷方法（与 axios 习惯类似，降低迁移 friction） */
export const api = {
  get: <T = any>(path: string, options?: ApiClientOptions) =>
    apiRequest<T>('GET', path, undefined, options),
  post: <T = any>(path: string, body?: unknown, options?: ApiClientOptions) =>
    apiRequest<T>('POST', path, body, options),
  put: <T = any>(path: string, body?: unknown, options?: ApiClientOptions) =>
    apiRequest<T>('PUT', path, body, options),
  patch: <T = any>(path: string, body?: unknown, options?: ApiClientOptions) =>
    apiRequest<T>('PATCH', path, body, options),
  delete: <T = any>(path: string, options?: ApiClientOptions) =>
    apiRequest<T>('DELETE', path, undefined, options),
};
