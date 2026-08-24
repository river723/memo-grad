/**
 * 桌面单机版 web 构建启动器。
 *
 * tauri.conf.json 的 beforeBuildCommand 走系统 shell，无法可移植地携带
 * 环境变量（Windows 不支持 `VAR=1 cmd` 语法），故由本脚本注入
 * OFFLINE_MODE 后再调用 expo export:web。配合 src-tauri/tauri.offline.conf.json
 * 经 `npm run tauri:build:offline` 使用。
 */
process.env.EXPO_PUBLIC_OFFLINE_MODE = '1';
delete process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT;

import { spawnSync } from 'child_process';
const r = spawnSync('npx', ['expo', 'export:web'], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
