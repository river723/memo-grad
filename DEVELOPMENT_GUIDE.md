# 考研英语生词学习App - 开发指南

## 📋 项目概览

这是一个专为考研英语学生设计的移动端生词学习应用，核心解决考研英语中的熟词僻义问题。应用采用React Native + Expo技术栈，支持iOS、Android和Web平台。

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
App 启动后进入“设置 → AI API设置”，填写 DeepSeek API Key，点击“测试连接”确认可用，再点击“保存 AI 设置”。

> API Key 仅保存在本机，不需要写入 `.env` 文件。

### 启动开发服务器
```bash
npx expo start
```

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

// 按分类获取单词
const readingWords = await StorageService.getWordsByCategory('reading');

// 搜索单词
const results = await StorageService.searchWords('abandon');

// 学习记录
await StorageService.addStudyRecord(record);

// 学习计划
const todayPlans = await StorageService.getTodayStudyPlan();
```

### 2. AI服务 (AIService)

**位置**: `src/services/AIService.ts`

**主要功能**:
- 单词AI分析（考研释义、熟词僻义）
- 真题文本单词提取
- AI内容生成（短文、练习题）

**使用示例**:
```typescript
const aiService = new AIService('your-api-key');

// 分析单词
const analysis = await aiService.analyzeWord('abandon');

// 从文本提取单词
const words = await aiService.extractWordsFromText(text);

// 生成学习内容
const content = await aiService.generateStudyContent([1,2,3], 'quiz');
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

### Web部署
```bash
npx expo export:web
# 输出到 web-build/ 目录
```

### 移动端构建
```bash
# iOS
npx expo build:ios

# Android
npx expo build:android
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

**下一步行动**: 开始开发单词录入页面，这是用户使用最频繁的核心功能。