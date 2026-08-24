# 考研英语生词学习App - 开发指南

## 📋 项目概览

这是一个专为考研英语学生设计的移动端生词学习应用，核心解决考研英语中的熟词僻义问题。应用采用React Native + Expo技术栈，支持iOS、Android和Web平台。

**双版本形态（2026-08 统一代码库）**：本项目只有**一个代码库、一条开发主线**（`NetDict` 分支），通过构建期开关 `OFFLINE_MODE` 产出两种产品形态：

| 形态 | 说明 | 数据 | AI |
|---|---|---|---|
| **网络版（在线）** | 登录 + 云同步 + 订阅 + Admin 后台 | 后端 API（飞牛 NAS Postgres）+ 本地缓存 | 云端代理 `/api/ai/*`（服务端统一 Key，配额计费） |
| **单机版（离线）** | 免登录、无云功能 | 全部本地（AsyncStorage / 本地 JSON） | 用户自配 DeepSeek Key 直连 |

旧单机分支 `feat/add-word-local-dict-analysis` 已删除，终点归档为 tag `archive/standalone-final`。详见下文 [🔀 双版本形态开发指南](#-双版本形态开发指南在线版--单机版)。

## 🏗️ 已完成的基础架构

### 1. 项目配置 ✅
- ✅ package.json 依赖配置
- ✅ app.json 应用配置
- ✅ babel.config.js 转译配置
- ✅ TypeScript 类型定义
- ✅ 项目目录结构

### 2. 核心服务 ✅
- ✅ StorageService - 本地数据存储（AsyncStorage）
- ✅ AIService - AI服务集成（DeepSeek API）
- ✅ StudyPlanService - 学习计划算法（艾宾浩斯记忆曲线）

### 3. 数据模型 ✅
- ✅ Word 单词模型
- ✅ StudyRecord 学习记录模型
- ✅ StudyPlan 学习计划模型
- ✅ 类型定义和常量配置

### 4. UI组件 ✅
- ✅ WordCard 单词卡片组件
- ✅ HomeScreen 首页仪表板
- ✅ 主题配置和导航结构

## 🚀 快速开始开发

### 环境准备
1. 安装Node.js 18+
2. 安装Expo CLI: `npm install -g @expo/cli`
3. 克隆项目并安装依赖: `npm install`

### 配置API密钥

- **单机版**：App 启动后进入“设置 → AI 设置”，填写 DeepSeek API Key，点击“测试连接”确认可用，再点击“保存 AI 设置”。
- **网络版**：无需配置——AI 走云端代理，Key 由服务端统一管理；AI 功能需订阅（Pro）解锁。

> 单机版 API Key 仅保存在本机，不需要写入 `.env` 文件。

### 启动开发服务器

```bash
npm run web              # 在线形态（默认）
npm run web:offline      # 单机形态
```

详见下文 [🔀 双版本形态开发指南](#-双版本形态开发指南在线版--单机版)。

### 静态内容数据源（词库 / 真题 / 故事）

词库与真题已迁到后端（`server/`），前端走四层降级：内存 → AsyncStorage → 后端 API（ETag/304）→ 本地 JSON fallback。

- **数据源开关**：`.env` 里的 `EXPO_PUBLIC_USE_REMOTE_CONTENT`
  - `true`（默认）：走后端 API + 客户端缓存（生产模式）
  - `false`：回落到 import 本地 JSON（后端未就绪时 / 审核前测试）
  - **单机形态强制走本地 JSON**：`OFFLINE_MODE=1` 时无论此开关如何取值，`REMOTE_CONTENT` 恒为 false（见 [src/config/appMode.ts](src/config/appMode.ts)），不受 `.env` 干扰
- **后端灌库与验证**（在 `server/` 目录）：
  ```bash
  npx prisma generate
  npx prisma migrate dev --name add_worddict_and_exam_content
  npm run seed:worddict        # 4801 词条
  npm run seed:exams           # 34 套卷 + 272 paperId
  npm run dev                  # 起服务
  npm run test:worddict        # 9 项 curl 验证
  npm run test:exams           # 12 项 curl 验证
  ```
- **缓存位置**：AsyncStorage 的 `content:*` key（全局共享、不带 userId 前缀、不进同步实体白名单）
- **数据流抽象层**：[src/utils/wordUtils.ts](src/utils/wordUtils.ts)（词库）与 [src/utils/realExamContent.ts](src/utils/realExamContent.ts)（真题），screen 一律经此访问，不得直接 import `src/data/*.json`（fallback 除外）

## 🔀 双版本形态开发指南（在线版 / 单机版）

### 开关机制

单一事实来源：[src/config/appMode.ts](src/config/appMode.ts)（构建期常量，非运行时配置）：

```ts
export const OFFLINE_MODE = process.env.EXPO_PUBLIC_OFFLINE_MODE === '1';
export const REMOTE_CONTENT =
  !OFFLINE_MODE && process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT !== 'false';
```

两条构建链都注入同一组环境变量：
- **Metro / 原生链**：Expo 自动内联 `EXPO_PUBLIC_*`；EAS 在 eas.json profile 的 `env` 里注入。
- **Webpack / Tauri 链**：[webpack.config.js](webpack.config.js) 用 DefinePlugin 注入；桌面包经 [scripts/build-web-offline.mjs](scripts/build-web-offline.mjs) 设置变量后构建。

> ⚠️ 环境变量是**打包期内联**的：运行中切换形态必须重启 Metro/webpack，改 `.env` 或 shell 变量对已启动的 dev server 不生效。

### 日常开发调试

| | 在线形态 | 单机形态 |
|---|---|---|
| web 启动 | `npm run web` | `npm run web:offline` |
| 手动设变量启动 | （默认即在线） | `EXPO_PUBLIC_OFFLINE_MODE=1 npm run web`（Git Bash） |
| 后端依赖 | 需要 `server/` 起服务（NAS 或本地） | 无任何后端依赖 |
| 登录墙 | 手机验证码登录 | 跳过，直达主界面 |
| AI 调试 | 服务端代理，需订阅/配额 | 设置→AI 填自配 Key 直连 DeepSeek |
| 词库/真题/故事 | 后端 API + 缓存 | 本地 JSON 即时加载 |
| Network 面板预期 | 有 `/api/*`、同步请求 | **零**自家 API 请求；仅 `api.deepseek.com` |

单机形态冒烟要点：免登录直达 → Settings 出现"AI 设置"区块 → 测试连接成功 → Stats 显示"本地用户 · 单机版" → DevTools 无对 `192.168.1.8:5888` 的请求。

**Windows PowerShell 陷阱**：`$env:EXPO_PUBLIC_OFFLINE_MODE='1'` 会持久化整个会话——同一窗口之后跑 `npm run web` 也仍是单机形态。用完执行 `Remove-Item Env:\EXPO_PUBLIC_OFFLINE_MODE`，或始终用 `npm run web:offline` 规避。

### 打包命令总览

| 形态 \ 平台 | 安卓 APK | Windows 桌面 | iOS（未签名 ipa） |
|---|---|---|---|
| **网络版（在线）** | `eas build -p android --profile preview` | `npm run tauri:build` | Actions 手动触发，mode=online |
| **单机版（离线）** | `eas build -p android --profile offline-apk` | `npm run tauri:build:offline` | Actions 手动触发，mode=offline |

```bash
# —— 在线安卓 APK（EAS 云构建，本机无 JDK/SDK 不能本地构建）——
eas build -p android --profile preview

# —— 单机安卓 APK（offline-apk profile 自带 OFFLINE_MODE 环境变量）——
eas build -p android --profile offline-apk

# —— 桌面在线版（先 expo export:web 再 Tauri 打包）——
npm run tauri:build

# —— 桌面单机版（beforeBuildCommand 经 scripts/build-web-offline.mjs
#    注入 OFFLINE_MODE 后导出 web，再用 src-tauri/tauri.offline.conf.json
#    差量覆写打包，productName 区分为"考研英语生词本单机版"）——
npm run tauri:build:offline

# 仅导出 web 不打包桌面：
npm run build:web            # 在线形态 → web-build/
npm run build:web:offline    # 单机形态 → web-build/
```

### iOS 构建（未签名 ipa + Sideloadly 重签）

本机无 Mac、无付费 Apple 开发者账号，iOS 走 GitHub 托管 macOS runner 产出**未签名 ipa**，
再本机用 Sideloadly + 免费 Apple ID 重签名安装（7 天有效期）。工作流：
[.github/workflows/build-ios.yml](.github/workflows/build-ios.yml)。

```bash
# 方式一：gh CLI 触发（--field 选形态）
gh workflow run build-ios.yml -f mode=online     # 网络版
gh workflow run build-ios.yml -f mode=offline    # 单机版

# 跟踪进度 / 下载产物（artifact 保留 14 天）
gh run watch
gh run download          # 解压得 kaoyan-unsigned-<online|offline>.ipa
```

方式二：GitHub 网页 → Actions → "Build Unsigned iOS IPA" → Run workflow → 选 mode。

注意：

- **push 到 NetDict 的自动触发只出网络版包**（零回归）；单机版仅手动触发。
- 两种形态的 Sideloadly 安装流程完全相同，仅 JS bundle 内联的 `EXPO_PUBLIC_*` 不同。
- 单机版 ipa 装机后冒烟：免登录直达主界面、设置出现 AI 设置区块、飞行模式下加单词/复习/AI 出题可用。
- 不走 EAS 构建 iOS：内部分发需要付费开发者账号做 ad-hoc 签名。

### 新功能开发守则

在共享代码上加新功能时只需回答一个问题：**这个功能离线能不能用？**

- **能（纯本地数据 + 本地 AI）** → 直接写，两种形态自动都有；
- **不能（依赖登录/云同步/订阅/Admin 等）** → 功能入口加一行守卫，离线包里自然隐藏：

```tsx
{OFFLINE_MODE ? <离线替代UI/> : (
  <AppButton title="立即升级到 Pro" onPress={() => navigation.navigate('Subscription')} />
)}
```

服务层模式参考 [src/services/AIService.ts](src/services/AIService.ts)：门面按 `OFFLINE_MODE` 分发到本地引擎或 API 代理，消费方零感知。涉及存储时注意：离线下 `StorageService` 的 userId 前缀恒为 null（兼容旧单机数据格式），不要在无守卫路径调用 `setCurrentUserId`。

### 发版前双形态冒烟清单

1. `npx tsc --noEmit` 通过（过滤 `grep -v src-tauri` 后应为空）
2. `npm run web` 在线基线：登录、token 恢复、5 分钟定时同步、402 弹订阅引导路径不变
3. `npm run web:offline`：免登录、AI 本地 Key 直连成功、Network 无自家 API 请求
4. `npm run test:migration` 迁移回归
5. EAS 双 profile 各出一包；离线包真机飞行模式冒烟（加单词→复习→AI 出题→备份导出）

## 📱 核心功能模块详解

### 1. 数据存储服务 (StorageService)

**位置**: `src/services/StorageService.ts`

**主要功能**:
- 单词CRUD操作
- 学习记录管理
- 学习计划管理
- 设置存储
- 数据导入导出

**核心方法**:
```typescript
// 添加单词
await StorageService.addWord(wordData);

// 获取单词列表
const words = await StorageService.getWords();

// 搜索单词
const results = await StorageService.searchWords('abandon');

// 学习记录
await StorageService.addStudyRecord(record);

// 学习计划
const todayPlans = await StorageService.getTodayStudyPlan();
```

### 2. AI服务 (AIService)

**位置**: `src/services/AIService.ts`（门面）+ `src/services/ai/localAIEngine.ts`（单机本地引擎）

**架构**: 按构建期开关 `OFFLINE_MODE` 分发，对外是**默认导出的单例**，8 个方法签名两形态一致：

- **在线形态**：走后端 `/api/ai/:action` 代理；402（配额耗尽/未订阅）抛 `SubscriptionRequiredError`，调用方可据此引导订阅。
- **单机形态**：`localAIEngine` axios 直连 DeepSeek，Key 取自设置页自配密钥（懒加载 + 30s 缓存）；无订阅概念。

**使用示例**:
```typescript
import AIService, { SubscriptionRequiredError } from '../services/AIService';

// 分析单词（两形态调用方式完全相同）
const analysis = await AIService.analyzeWord('abandon');

// 从文本提取单词
const words = await AIService.extractWordsFromText(text);

// 批量分析
const map = await AIService.analyzeWords(['abandon', 'ubiquitous']);

// 订阅引导（仅在线形态会抛出）
try {
  await AIService.generateFunArticle(words);
} catch (e) {
  if (e instanceof SubscriptionRequiredError) { /* 跳转订阅页 */ }
}
```

### 3. 学习计划算法 (StudyPlanService)

**位置**: `src/services/StudyPlanService.ts`

**核心算法**:
- 艾宾浩斯记忆曲线: [1, 2, 4, 7, 15, 30] 天
- 动态调整复习间隔
- 根据正确率智能调整难度

**使用示例**:
```typescript
const studyPlanService = new StudyPlanService();

// 生成学习计划
const plans = await studyPlanService.generateStudyPlan(
  30, // 学习天数
  10, // 每日新词数
  existingWords
);

// 计算学习统计
const stats = await studyPlanService.calculateStudyStats();
```

### 4. 单词卡片组件 (WordCard)

**位置**: `src/components/WordCard.tsx`

**功能特性**:
- 单词信息展示
- 发音功能
- 熟词僻义标注
- 形近词提醒
- 词根词缀分析
- 翻转卡片效果

## 🎯 待开发功能模块

### 模块1: 单词录入页面
**优先级**: ⭐⭐⭐⭐⭐

**功能需求**:
- 手动输入单词表单
- 实时AI分析预览
- 分类选择
- 难度设置

**开发步骤**:
1. 创建 `src/screens/AddWordScreen.tsx`
2. 实现表单验证
3. 集成AI分析服务
4. 添加数据保存功能

### 模块2: 真题批量导入
**优先级**: ⭐⭐⭐⭐⭐

**功能需求**:
- 文本粘贴区域
- AI自动提取生词
- 批量添加到生词本
- 分类自动识别

**开发步骤**:
1. 创建 `src/screens/TextImportScreen.tsx`
2. 集成AI单词提取
3. 实现批量操作界面
4. 添加进度提示

### 模块3: 背诵模式页面
**优先级**: ⭐⭐⭐⭐⭐

**功能需求**:
- 卡片翻转背诵
- 听音背词模式
- 答题模式
- 错题收集

**开发步骤**:
1. 创建 `src/screens/StudyScreen.tsx`
2. 实现不同背诵模式
3. 添加答题逻辑
4. 集成语音功能

### 模块4: 统计页面
**优先级**: ⭐⭐⭐⭐

**功能需求**:
- 学习进度图表
- 正确率统计
- 遗忘曲线分析
- 学习时间统计

**开发步骤**:
1. 创建 `src/screens/StatsScreen.tsx`
2. 集成图表库
3. 实现数据分析
4. 添加导出功能

### 模块5: 设置页面
**优先级**: ⭐⭐⭐

**功能需求**:
- 每日学习目标设置
- API密钥配置
- 主题切换
- 数据管理

**开发步骤**:
1. 创建 `src/screens/SettingsScreen.tsx`
2. 实现配置界面
3. 添加数据导入导出
4. 集成主题切换

## 🧪 测试策略

### 1. 单元测试
```bash
npm test
```

### 2. 组件测试
- 使用React Native Testing Library
- 测试核心组件渲染
- 测试用户交互

### 3. 集成测试（后端）
后端集成测试脚本位于 `server/scripts/`，纯 Node 22 + tsx 运行，不需要额外框架：

| 脚本 | 覆盖 | 跑法 |
|---|---|---|
| `test-password-service.mjs` | scrypt 哈希/校验 | `cd server && node --import tsx scripts/test-password-service.mjs` |
| `test-audit-log.mjs` | 审计日志写入 + 错误吞掉 | `cd server && node --import tsx scripts/test-audit-log.mjs` |
| `test-admin-queries.mjs` | 用户列表筛选 + 9 面板详情 | `cd server && node --import tsx scripts/test-admin-queries.mjs` |
| `test-user-admin.mjs` | 封禁/解封/改密/强制下线/重置配额 + LAST_ADMIN 守卫 | `cd server && node --import tsx scripts/test-user-admin.mjs` |
| `test-subscription-admin.mjs` | 授权/撤销订阅 + 409 守卫 | `cd server && node --import tsx scripts/test-subscription-admin.mjs` |
| `test-refund-and-orders.mjs` | 退款事务 + 跨用户订单列表 | `cd server && node --import tsx scripts/test-refund-and-orders.mjs` |
| `test-announcements.mjs` | 公告 CRUD + 公开 active 端点 | `cd server && node --import tsx scripts/test-announcements.mjs` |
| `test-e2e-admin.mjs` | **完整客服流程 e2e**（22 个用例） | `cd server && node --import tsx scripts/test-e2e-admin.mjs`（需服务在 :3000） |

跑全部：手工依次执行上面 7 个 `test-*.mjs`。

## 🛠️ 后台管理（Admin Console）

后端：18 个端点全部挂在 `/api/admin` 下，外加一个公开端点 `/api/announcements/active`。

### 角色与权限
- `User.role` 字段决定（`user` | `admin`），不在 JWT 里——每个 admin 请求都重新查库，**降级立即生效**
- 内联 preHandler 在 `server/src/routes/adminRoutes.ts:20-29` 强制要求 `role === 'admin' && !disabled`
- **LAST_ADMIN 守卫**：封禁/降级最后一个 admin → 409 `LAST_ADMIN`，防止自锁
- 救援工具：`server/scripts/manage-admin.ts list|promote|demote|unblock|rescue <phone|email>`

### 写动作清单（11 个敏感操作）
所有写动作必走 `services/auditLog.ts:writeAuditLog`（best-effort，失败不抛错）。

| 端点 | 触发 | 副作用 |
|---|---|---|
| `DELETE /api/admin/users/:id` | 封禁 | 撤销全部 refresh token |
| `PATCH .../role: 'user'` | 降级 | 撤销全部 refresh token（修 P0 自锁） |
| `PATCH .../disabled: false` | 解封 | 清空封禁元数据 |
| `POST .../reset-password` | 重置密码 | 撤销全部 refresh token |
| `POST .../force-logout` | 强制下线 | 撤销全部 refresh token（不改 disabled） |
| `POST .../reset-ai-quota` | 重置 AI 配额 | 删本月 AiUsage 行（订阅不受影响） |
| `POST .../grant-subscription` | 授权订阅 | 已有 active 时 409 |
| `POST .../revoke-subscription` | 撤销订阅 | status='refunded' |
| `POST .../refund-order` | 退款 | 事务里 order + 匹配订阅同步 refunded |
| `POST /api/admin/announcements` | 创建公告 | 写审计 |
| `DELETE /api/admin/announcements/:id` | 删除公告 | 写审计（硬删） |

### 退款匹配规则
退款会找用户的 active 订阅，要求：
- `source ∈ {wechat, alipay}`（不是后台授权的）
- `startsAt` 在 `order.paidAt ± 5 分钟` 内
- 多个候选取 `startsAt` 最接近 `paidAt` 的那一条

找不到匹配订阅时仍退款订单，返回 `warning` 字段提示管理员手动处理。

### 公告系统
- 时间窗 `now ∈ [startsAt, endsAt]` 过滤
- `audience='all'` 给所有人；`'pro'` 仅 Pro 用户可见
- 公开端点 `GET /api/announcements/active` 不需要登录；带 token 时区分 Pro/非 Pro
- 客户端通过 `AnnouncementProvider` 启动时拉一次 + `HomeScreen` focus 时刷新
- dismiss 状态存 AsyncStorage 按 announcement.id 持久化

### 前端入口
- `src/screens/AdminScreen.tsx` 是薄壳（109 行），5 个 Tab：概览/用户/订单/审计/公告
- 用户详情是嵌套子页（点列表项进入，back 回列表）
- 11 个敏感操作统一走 `src/screens/admin/components/ConfirmDialog.tsx`，支持 `requireReason` 强制填原因
- Tab 切换是自定义 ScrollView 横滑按钮（**不引入** @react-navigation/material-top-tabs）

## 📦 构建和部署

> 四种形态的打包命令总览见上文 [🔀 双版本形态开发指南 → 打包命令总览](#打包命令总览)，此处补充细节。

### Web / 桌面端（Tauri）

```bash
npm run build:web              # 在线形态导出 web → web-build/
npm run build:web:offline      # 单机形态导出 web（脚本内注入 OFFLINE_MODE=1）
npm run tauri:dev              # 桌面开发模式（在线形态）
npm run tauri:build            # 在线桌面包（nsis + msi）
npm run tauri:build:offline    # 单机桌面包，productName 为"考研英语生词本单机版"
```

单机桌面打包链：`src-tauri/tauri.offline.conf.json` 差量覆写 `beforeBuildCommand` 指向
[scripts/build-web-offline.mjs](scripts/build-web-offline.mjs)（Tauri 的 beforeBuildCommand 走系统 shell，
无法可移植地带环境变量，故由 Node 启动器注入）。

### 安卓（EAS 云构建；本机无 JDK17+SDK，不能本地构建）

```bash
eas build -p android --profile preview        # 在线版 APK（指向 NAS API 192.168.1.8:5888）
eas build -p android --profile offline-apk    # 单机版 APK（profile.env 注入 OFFLINE_MODE）
```

profile 定义见 [eas.json](eas.json)；`EXPO_PUBLIC_*` 由 EAS 写入构建机环境后由 Metro 静态内联。

### 类型检查

```bash
npx tsc --noEmit 2>&1 | grep -v src-tauri   # 过滤 Rust 构建产物的 TS1490 噪音后应为空
```

### 后端部署（网络版）

```bash
# 一键 rsync 到飞牛 NAS 并远程重建容器 memograd-api
cd server && ./deploy-nas.sh
```

## 🎨 UI设计规范

### 颜色主题
```typescript
const theme = {
  primary: '#1976D2',    // 主色调
  accent: '#FF9800',     // 强调色
  success: '#4CAF50',    // 成功色
  warning: '#FF9800',    // 警告色
  error: '#F44336',      // 错误色
  background: '#F5F5F5', // 背景色
  surface: '#FFFFFF',    // 表面色
  text: '#212121',       // 文本色
};
```

### 字体规范
- 标题: 18px, 粗体
- 正文: 14px, 常规
- 辅助文本: 12px, 浅色

## 🔧 开发技巧

### 1. 调试技巧
- 使用React Native Debugger
- 启用Flipper调试
- 使用console.log调试

### 2. 性能优化
- 列表使用FlatList
- 图片使用适当尺寸
- 避免不必要的重渲染

### 3. 错误处理
- 使用try-catch包装异步操作
- 提供用户友好的错误提示
- 记录错误日志

## 📚 参考资料

### React Native
- [React Native 官方文档](https://reactnative.dev/)
- [Expo 文档](https://docs.expo.dev/)
- [React Native Paper](https://callstack.github.io/react-native-paper/)

### AI集成
- [DeepSeek 开放平台](https://platform.deepseek.com/)
- [DeepSeek API 文档](https://api-docs.deepseek.com/)

### 学习算法
- [艾宾浩斯遗忘曲线](https://zh.wikipedia.org/wiki/%E9%81%97%E5%BF%98%E6%9B%B2%E7%BA%BF)
- [间隔重复算法](https://en.wikipedia.org/wiki/Spaced_repetition)

---

**继续开发的日常流程**：`npm run web`（在线）或 `npm run web:offline`（单机）调试 →
`npx tsc --noEmit 2>&1 | grep -v src-tauri` 验证 → 按需 `eas build --profile <preview|offline-apk>` /
`npm run tauri:build[:offline]` 出包。新功能先回答"离线能不能用"，见 [新功能开发守则](#新功能开发守则)。