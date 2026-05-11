# 快速开始指南

## 🎯 3分钟上手

### 第一步：环境准备

```bash
# 1. 安装Node.js 18+
# 下载地址：https://nodejs.org/

# 2. 安装Expo CLI
npm install -g @expo/cli

# 3. 克隆项目
git clone <your-repo-url>
cd kaoyan-english-vocabulary

# 4. 安装依赖
npm install
```

### 第二步：配置API密钥

创建 `.env` 文件：
```bash
# 在项目根目录创建 .env 文件
touch .env
```

添加你的OpenRouter API密钥：
```
OPENROUTER_API_KEY=your_api_key_here
```

> **获取API密钥**: 访问 [OpenRouter.ai](https://openrouter.ai/) 注册并获取免费API密钥

### 第三步：启动应用

```bash
# 启动开发服务器
npx expo start

# 选择运行平台：
# - 按 'w' 在浏览器中运行
# - 按 'i' 在iOS模拟器中运行  
# - 按 'a' 在Android模拟器中运行
# - 扫描二维码在真机中运行
```

## 📱 核心功能体验

### 1. 添加第一个单词

```typescript
import StorageService from './src/services/StorageService';
import AIService from './src/services/AIService';

// 创建AI服务实例
const aiService = new AIService('your-api-key');

// 分析单词
const analysis = await aiService.analyzeWord('abandon');

// 保存到生词本
const wordId = await StorageService.addWord({
  word: 'abandon',
  definitions: analysis.definitions,
  etymology: analysis.etymology,
  similar_words: analysis.similar_words,
  category: 'reading',
  difficulty: 3,
  frequency: 5
});

console.log(`单词已添加，ID: ${wordId}`);
```

### 2. 生成学习计划

```typescript
import StudyPlanService from './src/services/StudyPlanService';

const studyPlanService = new StudyPlanService();

// 生成30天学习计划，每天10个新词
const plans = await studyPlanService.generateStudyPlan(
  30,  // 学习天数
  10,  // 每日新词数
  []   // 现有单词列表
);

console.log(`生成学习计划: ${plans.length} 个任务`);
```

### 3. 查看学习统计

```typescript
// 获取今日学习统计
const stats = await studyPlanService.calculateStudyStats();

console.log('学习统计:', {
  总单词数: stats.totalWords,
  已掌握: stats.masteredWords,
  今日进度: `${(stats.todayProgress * 100).toFixed(1)}%`
});
```

## 🎨 自定义配置

### 修改主题颜色
编辑 `App.tsx` 中的主题配置：

```typescript
const theme = {
  colors: {
    primary: '#1976D2',    // 修改主色调
    accent: '#FF9800',     // 修改强调色
    // ... 其他颜色配置
  },
};
```

### 调整学习参数
编辑 `src/constants/index.ts`：

```typescript
// 修改艾宾浩斯复习间隔
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60];

// 修改每日新词限制
export const DAILY_NEW_WORDS_LIMIT = 20;
```

## 🧪 功能测试

运行演示脚本：
```bash
node demo.js
```

运行单元测试：
```bash
npm test
```

## 🚀 开发新功能

### 创建新页面

1. 在 `src/screens/` 创建新文件：
```typescript
// src/screens/MyNewScreen.tsx
import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

export default function MyNewScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>我的新页面</Text>
    </View>
  );
}
```

2. 在导航中注册：
```typescript
// App.tsx
<Tab.Screen name="新功能" component={MyNewScreen} />
```

### 添加新组件

1. 在 `src/components/` 创建组件：
```typescript
// src/components/MyComponent.tsx
import React from 'react';
import { Button } from 'react-native-paper';

interface MyComponentProps {
  onPress: () => void;
  title: string;
}

export default function MyComponent({ onPress, title }: MyComponentProps) {
  return (
    <Button mode="contained" onPress={onPress}>
      {title}
    </Button>
  );
}
```

## 📦 数据管理

### 导出数据
```typescript
const data = await StorageService.exportData();
// 保存data到文件
```

### 导入数据  
```typescript
await StorageService.importData(jsonData);
```

### 清空数据
```typescript
await StorageService.clearAllData();
```

## 🐛 常见问题

### Q: 应用启动失败怎么办？
A: 
1. 检查Node.js版本 (需要18+)
2. 重新安装依赖: `rm -rf node_modules && npm install`
3. 清除缓存: `npx expo start --clear`

### Q: API调用失败怎么办？
A:
1. 检查API密钥是否正确
2. 检查网络连接
3. 查看控制台错误信息

### Q: 如何修改默认分类？
A: 编辑 `src/constants/index.ts` 中的 `WORD_CATEGORIES`

## 🎓 学习资源

### React Native学习
- [React Native官方文档](https://reactnative.dev/docs/getting-started)
- [Expo文档](https://docs.expo.dev/)
- [React Native Paper组件库](https://callstack.github.io/react-native-paper/)

### TypeScript学习
- [TypeScript官方文档](https://www.typescriptlang.org/docs/)
- [React TypeScript教程](https://react-typescript-cheatsheet.netlify.app/)

### AI集成学习
- [OpenRouter API文档](https://openrouter.ai/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)

## 🤝 寻求帮助

### 代码问题
- 查看 `DEVELOPMENT_GUIDE.md` 获取详细开发指南
- 阅读源码注释和类型定义
- 运行 `demo.js` 查看功能演示

### 功能建议
- 查看 `PROJECT_SUMMARY.md` 了解项目规划
- 参考已完成的核心服务实现
- 遵循现有的代码规范和架构

## 🎯 下一步行动

### 新手推荐
1. **运行演示**: `node demo.js`
2. **启动应用**: `npx expo start`
3. **浏览代码**: 从 `src/services/` 开始
4. **修改UI**: 尝试更改主题颜色
5. **添加功能**: 创建简单的设置页面

### 进阶开发
1. **实现单词录入页面**
2. **完善背诵模式**
3. **添加统计图表**
4. **优化AI提示词**
5. **完善错误处理**

---

**祝开发顺利！如有问题随时参考项目文档。** 🚀

**项目文档**: 
- `README.md` - 项目概述
- `DEVELOPMENT_GUIDE.md` - 详细开发指南  
- `PROJECT_SUMMARY.md` - 项目总结和架构
- `demo.js` - 功能演示脚本