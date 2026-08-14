# MemoGrad 网络版改造规划

## 决策摘要（已确认）

| 维度 | 选择 |
|---|---|
| 后端栈 | Node + Fastify + Postgres + Redis，TypeScript 与前端共享类型 |
| 数据同步 | 全量云同步，本地优先（local-first）+ 后台推送 |
| 付费模型 | 月费订阅 + 配额上限 |
| 支付渠道 | 微信支付 + 支付宝（Web/桌面为主） |

## 现状基线

- 前端 Expo SDK 55 + React Native 0.85 + react-native-paper，40 个 screen，四个 Tab（学习/阅读/练习/我的）
- 全部持久化经 [StorageService.ts](src/services/StorageService.ts) 单例 → AsyncStorage，11 个 storage key，无同步元数据
- ID 生成方式为 `max(id)+1` 或时间戳 —— **多设备同步会撞 ID，这是必须先解决的前置问题**
- AI 全部经 [AIService.ts](src/services/AIService.ts)，用户自填 DeepSeek key，8 个业务方法，被 8 个 screen 直接 `new` / `fromSettings` 调用
- 静态内容 8.4MB 打进 bundle：`worddict.json` 4.7MB、`realExams.json` 2.9MB、`stories.json` 724KB
- Tauri 桌面端已配置（src-tauri/），web 构建走 webpack

## 关键设计判断

**1. AI 密钥必须收归服务端。** 现在 8 个 screen 各自持有 apiKey 并直连 DeepSeek。付费墙若只做前端判断，用户改本地存储即可绕过；且自填 key 模式下你无法计量。改造方式是保持 `AIService` 的 8 个方法签名不变，把内部 axios 目标从 `api.deepseek.com` 换成 `/api/ai/*`，请求头带 JWT 而非 API key。**8 个调用点因此零改动** —— 这是本次改造成本最低的一环，务必保持签名兼容。

**2. 同步的真正难点是 ID，不是网络。** 现有自增 ID 在两台设备各建一个 word 会同时得到 id=5。需先把 ID 迁移到 UUID（客户端生成），并给每条记录加 `updated_at` / `deleted_at` / `dirty` 三个字段。这是同步的地基，比写 sync API 更关键。

**3. 静态内容已上云（2026-08 完成）。** worddict/realExams 已从 bundle 迁到后端（Prisma 表 + 公开 API + ETag/304），客户端走「内存 → AsyncStorage → 远程 → 本地 JSON fallback」四层降级。stories 方案已批准待实施。详见 [fuzzy-churning-wozniak.md](C:\Users\Administrator\.claude\plans\fuzzy-churning-wozniak.md) 与 [server/prisma/schema.prisma](server/prisma/schema.prisma) 的「公共静态内容」段。原决策「第一期保留现状」已被取代——内容资产需要可控更新（修错不发版）、防盗（IP 不裸奔在 bundle）、可观测（使用数据）。

**4. 免费/付费的功能切分：**
- 免费（无 AI）：词库浏览、生词本、卡片背诵、听音背词、真题练习全部题型、错题本、统计、系列故事阅读
- 付费（需 AI）：单词 AI 解析、AI 生成趣味文章、AI 生成考题（完形/释义）、真题 AI 解析、文本提取生词

## 实施阶段

### 阶段 0：数据模型前置改造（前端，无后端依赖）

必须先做，否则后续同步无法落地。

- `src/types/index.ts`：所有实体 `id?: number` → `id: string`（UUID v4），新增 `updated_at: string`、`deleted_at?: string | null`
- `src/services/StorageService.ts`：抽出 `generateId()`；删除改为软删除（写 `deleted_at`）；所有写操作打 `updated_at` 与 dirty 标记
- 写一次性迁移函数：读旧数据 → 数字 ID 映射为 UUID → 同步修正 `StudyRecord.word_id`、`StudyPlan.word_id`、`Article.word_ids` 的外键引用 → 回写 + 标记 `schema_version`
- 涉及 ID 比较的 screen 逐个核对（`id === `、`w.id!` 等模式）

**验收**：单机功能全部照旧，重启 app 数据不丢，旧版本数据可平滑升级。

### 阶段 1：后端骨架 + 认证

新建 `server/` 目录（同仓 monorepo，共享 `src/types`）。

- Fastify + Prisma + Postgres；Redis 用于配额计数与 refresh token 黑名单
- 表：`users`、`devices`、`subscriptions`、`orders`、`ai_usage`、以及各同步实体表（`words`/`study_records`/`study_plans`/`articles`/`exam_sessions`/`wrong_questions`/`real_exam_sessions`/`real_exam_wrong_questions`）
- 认证：手机号 + 短信验证码（国内主流，规避密码找回流程）；备选邮箱密码。JWT access token 15min + refresh token 30天
- `POST /auth/send-code`、`/auth/login`、`/auth/refresh`、`/auth/logout`、`GET /me`

**验收**：curl 能完成注册登录拿到 token，`/me` 返回用户与订阅状态。

### 阶段 2：前端接入登录态

- 新增 `src/services/ApiClient.ts`：axios 实例 + JWT 注入 + 401 自动 refresh + 失败重试
- 新增 `src/providers/AuthProvider.tsx`：暴露 `user`、`subscription`、`login()`、`logout()`、`isPro`
- `App.tsx` 在 `ThemeProvider` 内层包 `AuthProvider`
- 新增 `LoginScreen` / `RegisterScreen`；`AppNavigator.tsx` 的 RootStack 按 `user` 有无切换 Auth / Main 两个分支
- 「我的」Tab 加账号区块（当前套餐、配额剩余、退出登录）

**验收**：未登录进登录页，登录后进主应用，token 过期自动续期，退出清理本地 token。

### 阶段 3：AI 代理 + 配额（付费墙落地）

- 后端 `POST /api/ai/:action`，action 覆盖 `analyzeWord` / `analyzeWords` / `generateFunArticle` / `generateClozeQuestions` / `generateDefinitionQuestions` / `generateRealExamExplanation` / `extractWordsFromText` / `generateStudyContent`
- prompt 全部移到服务端（从 AIService 平移，前端不再持有 prompt）
- 中间件链：`authGuard` → `subscriptionGuard`（校验 `subscriptions.status=active` 且未过期）→ `quotaGuard`（Redis 原子 `INCR` 计数，超限返回 402）
- 记 `ai_usage` 明细（action、tokens、耗时），用于成本核算与将来定价调整
- 前端 `AIService.ts` 改造为调 ApiClient；**8 个方法签名保持不变**
- `SettingsScreen.tsx` 移除 API key 输入 UI，改为订阅状态展示；`AppSettings.apiKey` 保留字段但废弃（避免破坏旧数据反序列化）
- 8 个调用点的 `if (!settings.apiKey)` 前置判断改为 `if (!isPro)` → 引导订阅页

**验收**：免费账号调 AI 返回 402 并弹订阅引导；付费账号正常；配额耗尽有明确提示。这一步做完付费墙即成立。

### 阶段 4：订阅与支付

- 后端接微信支付 Native（扫码）+ 支付宝电脑网站支付；`POST /orders`（下单返回二维码）、`POST /webhooks/wechat`、`/webhooks/alipay`
- webhook 必须验签 + 幂等（`orders.out_trade_no` 唯一约束）
- 订阅到期由定时任务扫 `subscriptions.expires_at` 置为 expired；月费为「买断一个月」而非自动续费（微信 Native 不支持免密续费，规避复杂度）
- 前端新增 `SubscriptionScreen`：套餐卡片 + 二维码 + 轮询订单状态
- **移动端不放支付入口**（App Store 数字内容必须走 IAP，绕过会被拒审）；移动端仅显示「请在网页版开通」

**验收**：Web 端扫码支付 → webhook 到账 → 订阅激活 → AI 立即可用；重复 webhook 不重复延期。

### 阶段 5：全量云同步

- 后端 `POST /sync`：收 `{ lastSyncAt, changes: {entity: [...]} }`，返回 `{ serverTime, changes }`
- 冲突策略：**last-write-wins 按 `updated_at`**（学习类数据无协同编辑，LWW 足够；不引入 CRDT）
- 前端新增 `src/services/SyncService.ts`：
  - 本地写入立即返回（保持现有体验），标记 dirty
  - 触发时机：app 启动、切前台、每 5 分钟、手动下拉
  - 离线时入队，恢复网络后重放
  - 拉取远端变更后合并入 AsyncStorage，广播事件让 screen 刷新
- 登录首次同步做「本地数据认领」：把未登录期间的本地数据全部标 dirty 推上云

**验收**：A 设备加词 → B 设备同步后可见；飞行模式下操作恢复网络后自动上行；同一条记录两端并发修改后收敛到较晚的版本。

### 阶段 6：加固与上线

- 限流（登录/短信/AI 分别限）、请求体大小限制、CORS 白名单
- 短信验证码防刷（同号 60s + 单 IP 日限）
- 数据库备份策略、Postgres 慢查询索引核查（`words(user_id, updated_at)` 等同步查询索引）
- 部署：国内云 + Docker Compose；HTTPS 证书；`.env` 密钥管理（**当前 `.env` 里的 DeepSeek key 已在仓库历史中，需轮换**）
- 前端埋点：注册转化、订阅转化、AI 调用失败率

## 风险与注意事项

- **`.env` 中的 DeepSeek API key 需立即轮换** —— 虽在 .gitignore 中，但 key 已明文出现在当前工作区，且服务端代理后这个 key 将成为唯一成本出口
- **阶段 0 的 ID 迁移是不可逆操作**，需先写迁移测试并保留回滚用的原始数据快照
- **AI 成本兜底**：`ai_usage` 表要在阶段 3 就位，否则定价拍脑袋。建议初期把月配额设保守（如 300 次），观察真实用量再放宽
- **移动端支付合规**：iOS 端不能出现任何指向外部支付的链接或文案暗示（Apple 3.1.1），只能完全不提
- 静态内容已后端化（词库 4.79MB + 真题 2.9MB 不再进 bundle）；stories 723KB 待实施

## 建议起步

阶段 0 与阶段 1 可并行（前端改数据模型 / 后端搭骨架，互不依赖）。阶段 3 结束时商业模式即已闭环可验证 —— 若想最快验证付费意愿，可先跳过阶段 5，用阶段 0-4 上线。
