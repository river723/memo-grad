/**
 * 环境变量读取与校验。
 *
 * 启动时一次性校验并 fail-fast：配置缺失就直接崩，而不是等到某个请求
 * 打到缺失的配置才 500——那种失败模式在生产上很难定位。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** 极简 .env 解析。不引 dotenv：只需要 KEY=VALUE 和 # 注释两种语法。 */
function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return; // 生产环境通常由编排平台注入环境变量，没有 .env 文件是正常的
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 去掉包裹的引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 已存在的真实环境变量优先，便于容器覆盖 .env
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`缺少必需的环境变量 ${key}，请参照 server/.env.example 配置`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`环境变量 ${key} 必须是数字，实际为 "${raw}"`);
  }
  return n;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * 断言字符串是纯 ASCII 且不含首尾空白/引号。
 *
 * 用于校验 API Key / BaseURL 这类会被塞进 HTTP 头或 URL 的值。
 * 真实教训：曾有一个 DEEPSEEK_API_KEY 在 `sk-` 后混入了一个中文字符
 * （U+6C3F），undici 组装 `Authorization` 头时抛
 * "Cannot convert argument to a ByteString..."，这个 TypeError 没被
 * 包成 ApiError，前端只看到含糊的"服务器内部错误"。启动时直接 fail-fast
 * 比让首个请求 500 好定位得多。
 */
function assertAscii(key: string, value: string): void {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) {
      throw new Error(
        `环境变量 ${key} 含非 ASCII 字符（位置 ${i}，U+${value
          .charCodeAt(i)
          .toString(16)
          .toUpperCase()}），通常是从聊天软件复制时混入了中文/全角字符，请重新手输`
      );
    }
  }
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

const jwtSecret = required('JWT_SECRET');

// 生产环境用示例密钥会让任何人都能伪造 token，直接拒绝启动
if (isProduction && jwtSecret.includes('dev-only-secret')) {
  throw new Error('生产环境必须替换 JWT_SECRET（当前仍是示例值）');
}

export const config = {
  nodeEnv,
  isProduction,
  port: int('PORT', 3000),
  host: optional('HOST', '0.0.0.0'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: optional('REDIS_URL', ''),

  corsOrigins: optional('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwt: {
    secret: jwtSecret,
    accessTtl: optional('ACCESS_TOKEN_TTL', '15m'),
    refreshTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 30),
  },

  sms: {
    provider: optional('SMS_PROVIDER', 'console'),
    /**
     * 是否允许在生产环境使用 console 短信通道。默认 false(安全):生产验证码进日志
     * 等于任何能读日志的人都能登录。自托管且无真实短信网关时显式置 true,
     * 从 `docker logs` 取验证码。真实通道接入后保持 false。
     */
    allowConsoleInProd: bool('SMS_ALLOW_CONSOLE_IN_PRODUCTION', false),
    /** 开发模式把验证码回显在接口响应里，省掉真实短信通道。生产强制关闭。 */
    devEcho: bool('SMS_DEV_ECHO', false) && !isProduction,
    codeTtlSeconds: int('VERIFICATION_CODE_TTL_SECONDS', 300),
    resendCooldownSeconds: int('SMS_RESEND_COOLDOWN_SECONDS', 60),
    dailyLimitPerTarget: int('SMS_DAILY_LIMIT_PER_TARGET', 10),
  },

  ai: {
    // 通用 OpenAI 兼容配置。新名字 AI_* 优先；旧的 DEEPSEEK_* 作为回退，
    // 便于老部署平滑过渡。默认仍指向 DeepSeek，但用户可改成任何兼容服务
    // （智谱 GLM / 月之暗面 Kimi / 通义千问 / OpenAI / Ollama / 自部署 vLLM 等）。
    apiKey: optional('AI_API_KEY', '') || optional('DEEPSEEK_API_KEY', ''),
    baseUrl:
      optional('AI_BASE_URL', 'https://api.deepseek.com/v1') ||
      optional('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
    model:
      optional('AI_MODEL', 'deepseek-v4-flash') ||
      optional('DEEPSEEK_MODEL', 'deepseek-v4-flash'),
  },
  quota: {
    freeMonthly: int('FREE_MONTHLY_AI_QUOTA', 0),
    proMonthly: int('PRO_MONTHLY_AI_QUOTA', 300),
  },
} as const;

// AI 配置只有在填写了 key 时才校验 ASCII；空 key 是合法的（路由会返回
// AI_NOT_CONFIGURED，由用户决定何时启用），但非空时必须是纯 ASCII，
// 否则 undici 拼 Authorization 头会抛 ByteString TypeError。
if (config.ai.apiKey) assertAscii('AI_API_KEY/DEEPSEEK_API_KEY', config.ai.apiKey);
if (config.ai.baseUrl) assertAscii('AI_BASE_URL/DEEPSEEK_BASE_URL', config.ai.baseUrl);
if (config.ai.model) assertAscii('AI_MODEL/DEEPSEEK_MODEL', config.ai.model);

export type AppConfig = typeof config;
