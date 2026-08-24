/**
 * 应用形态开关（构建期常量，两条构建链统一从这里读）。
 *
 * - Metro / 原生链：Expo 自动把 EXPO_PUBLIC_* 环境变量内联进 bundle；
 *   EAS 在 eas.json profile 的 env 里注入（见 offline-apk profile）。
 * - Webpack / Tauri 链：webpack.config.js 用 DefinePlugin 注入同名变量，
 *   桌面离线包经 scripts/build-web-offline.mjs 设置环境变量后构建。
 *
 * OFFLINE_MODE=1 → 单机形态：
 *   跳过登录墙（AuthProvider 返回本地假用户）、禁用云同步/订阅/Admin/公告请求、
 *   AI 走本地引擎（用户自配 API Key）、词库/真题/故事直接用本地 JSON。
 * 不设置 → 网络形态，行为与历史版本完全一致。
 */

export const OFFLINE_MODE = process.env.EXPO_PUBLIC_OFFLINE_MODE === '1';

/**
 * 远程内容开关。离线强制走本地 JSON；在线沿用老开关
 * EXPO_PUBLIC_USE_REMOTE_CONTENT !== 'false' 的既有语义。
 */
export const REMOTE_CONTENT =
  !OFFLINE_MODE && process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT !== 'false';
