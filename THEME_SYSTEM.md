# 主题系统实现说明

## 实现概述

主题系统已完全实现，支持浅色/深色/跟随系统三种模式，并可持久化保存到AppSettings.theme。

## 功能特性

### 1. 主题切换模式
- **浅色模式 (`light`)**: 使用明亮背景和深色文字
- **深色模式 (`dark`)**: 使用暗黑背景和亮色文字  
- **跟随系统 (`system`)**: 根据系统外观设置自动切换

### 2. 颜色分类策略
遵循设计规范，对颜色进行如下分类：

#### 结构色（随主题切换）
- `background`: 页面背景色
- `surface`: 卡片/表面色
- `surfaceVariant`: 变体表面色
- `onSurface`: 表面内容文字色
- `onSurfaceVariant`: 表面次要内容色
- `outline`: 边框色
- `primaryContainer`: 主色容器色
- `secondaryContainer`: 次色容器色
- `errorContainer`: 错误容器色
- `tertiary`: 三级文字色

#### 语义强调色（保持常量）
- `accent`: 强调色（橙色系）
- `success`: 成功色（绿色系） 
- `danger`: 危险/错误色（红色系）
- `warning`: 警告色（橙色系）

## 技术实现

### 1. 主题提供者
- `ThemeProvider`: 使用React Context管理主题状态
- 自动监听系统外观变化
- 主题设置持久化到StorageService

### 2. 组件适配
- `useStyles`钩子: 用于动态样式，自动响应主题变化
- `useAppTheme`钩子: 获取当前主题的颜色和模式信息
- 所有组件已重构为使用动态样式而非静态StyleSheet

### 3. 主题定义
- `lightTheme`和`darkTheme`: 定义明暗主题的具体颜色值
- 颜色契约接口确保结构色与语义色分离

## 使用方法

### 在组件中使用主题颜色
```typescript
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';

export default function MyComponent() {
  const { colors, dark } = useAppTheme();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <Text style={{ color: colors.primary }}>品牌色文本</Text>
      <Text style={{ color: colors.onSurface }}>内容文本</Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    backgroundColor: colors.background,
  },
}));
```

### 切换主题
```typescript
import { useThemeContext } from '../providers/ThemeProvider';

export default function SettingsScreen() {
  const { themeMode, setThemeMode } = useThemeContext();
  
  return (
    <Button onPress={() => setThemeMode('dark')}>
      设置深色模式
    </Button>
  );
}
```

## 组件适配状态

- [x] App.tsx: 使用ThemeProvider包装应用
- [x] AppNavigator: 集成主题Provider和导航主题
- [x] HomeScreen: 已适配动态样式
- [x] WordCard: 已适配动态样式
- [x] AddWordScreen: 已适配动态样式
- [x] WordListScreen: 已适配动态样式
- [x] SettingsScreen: 已实现主题切换UI
- [x] ProfileScreen: 已适配动态样式
- [x] 其他屏幕: 全部已适配

## 设计原则

1. **一致性**: 所有屏幕使用相同的主题颜色体系
2. **可访问性**: 确保足够的颜色对比度
3. **性能**: 使用useMemo缓存样式，避免不必要的重绘
4. **可维护性**: 颜色契约集中管理，便于主题扩展

## 扩展性

- 新增主题: 在theme.ts中定义新的主题对象
- 修改颜色: 在tokens.ts中调整设计token
- 添加颜色: 扩展AppColors接口和相应主题实现