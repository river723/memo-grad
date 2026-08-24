/**
 * 单机版 web 开发启动器（npm run web:offline）。
 *
 * 注入 OFFLINE_MODE 后调用 expo start --web，免登录直达主界面、AI 走本地 Key、
 * 词库/真题/故事走本地 JSON。与 build-web-offline.mjs 同理：避免在 Windows
 * 各 shell 里手写环境变量语法（PowerShell 的 $env:X 还会持久化整个会话）。
 *
 * 调试提示：
 * - 改动热更新照常可用；但切换 OFFLINE_MODE 需重启 Metro（内联发生在打包期）。
 * - DevTools Network 面板应看不到任何对自家 API（/api/*、192.168.1.8:5888）的请求；
 *   AI 请求直连 api.deepseek.com（需先在 设置→AI 填入自己的 DeepSeek Key）。
 */
process.env.EXPO_PUBLIC_OFFLINE_MODE = '1';
delete process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT;

import { spawnSync } from 'child_process';
const r = spawnSync('npx', ['expo', 'start', '--web'], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
