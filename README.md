# 考研英语二生词学习App

一个专为考研英语二学生设计的生词学习应用，重点解决熟词僻义问题，提供AI辅助学习和个性化学习计划。

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn
- Expo CLI

### 安装步骤

1. 克隆项目并安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm start
```

3. 在 App 设置页配置 DeepSeek API Key：
- 打开 App 后进入“设置”
- 在“AI API设置”中填写 DeepSeek API Key
- 点击“测试连接”确认可用，再点击“保存 AI 设置”

4. 在模拟器或真机上运行：
- iOS: 按 `i` 或在iOS模拟器中运行
- Android: 按 `a` 或在Android模拟器中运行
- Web: 按 `w` 或在浏览器中运行

## 📱 核心功能

### 1. 生词录入
- ✅ 手动录入单词
- ✅ 真题批量导入
- ✅ 自动分类标签

### 2. AI翻译与解析
- ✅ 考研专属释义
- ✅ 熟词僻义标注
- ✅ 形近词关联
- ✅ 词根词缀分析

### 3. 智能学习计划
- ✅ 艾宾浩斯记忆算法
- ✅ 个性化复习安排
- ✅ 薄弱单词重点复习

### 4. AI内容生成
- ✅ 考研同源短文
- ✅ 真题风格练习题
- ✅ 作文高级句型

### 5. 背诵模式
- ✅ 卡片翻转背诵
- ✅ 听音背词
- ✅ 错题收集

## 🏗️ 项目结构

```
src/
├── components/     # 可复用UI组件
├── screens/        # 页面组件
├── services/       # 业务逻辑服务
├── utils/          # 工具函数
├── hooks/          # 自定义Hook
├── types/          # TypeScript类型定义
└── constants/      # 常量配置
```

## 🔧 技术栈

- **前端框架**: React Native + Expo
- **UI组件库**: React Native Paper
- **导航**: React Navigation
- **本地存储**: SQLite (expo-sqlite)
- **AI服务**: DeepSeek API
- **语音**: expo-speech
- **状态管理**: React Hooks

## 📊 数据库设计

### 主要数据表
1. **words** - 生词表
2. **study_records** - 学习记录表
3. **study_plans** - 学习计划表

## 🔑 API配置

应用使用 DeepSeek API 提供 AI 单词分析、文章生成和考题生成功能。API Key 不需要写入 `.env`，请在 App 的“设置 → AI API设置”中填写并保存。

## 🎯 开发计划

### 已完成 ✅
- [x] 项目基础架构
- [x] 数据库服务
- [x] AI服务集成
- [x] 学习计划算法
- [x] 单词卡片组件
- [x] 首页仪表板

### 待开发 🚧
- [ ] 单词录入页面
- [ ] 真题导入功能
- [ ] 背诵模式页面
- [ ] 练习题生成
- [ ] 统计页面
- [ ] 设置页面

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

MIT License

## 💡 使用说明

### 配置API密钥
1. 注册并登录 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 获取 API Key
3. 打开 App，进入“设置 → AI API设置”
4. 填写 API Key，点击“测试连接”确认可用，再点击“保存 AI 设置”

### 数据库初始化
应用首次启动时会自动创建SQLite数据库和必要的表结构。

### 学习计划定制
可以在设置中调整：
- 每日新词数量
- 复习间隔
- 难度系数
- 学习模式偏好

## 🐛 常见问题

### Q: 如何配置AI功能？
A: 在 App 的“设置 → AI API设置”中填写 DeepSeek API Key，并点击“测试连接”验证。

### Q: 如何调整艾宾浩斯复习间隔？
A: 在 `constants/index.ts` 中修改 `REVIEW_INTERVALS` 数组

### Q: 数据如何备份？
A: 应用支持生词本导入导出功能，可以定期备份数据

---

**专注考研，高效背词！** 🎓