import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import AddWordScreen from '../screens/AddWordScreen';
import StudyScreen from '../screens/StudyScreen';
import StatsScreen from '../screens/StatsScreen';
import WordListScreen from '../screens/WordListScreen';
import WordDetailScreen from '../screens/WordDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PracticeHubScreen from '../screens/PracticeHubScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ArticleListScreen from '../screens/ArticleListScreen';
import ArticleGenerateScreen from '../screens/ArticleGenerateScreen';
import ArticleDetailScreen from '../screens/ArticleDetailScreen';
import ExamSetupScreen from '../screens/ExamSetupScreen';
import ExamAnswerScreen from '../screens/ExamAnswerScreen';
import ExamResultScreen from '../screens/ExamResultScreen';
import WrongQuestionReviewScreen from '../screens/WrongQuestionReviewScreen';
import ExamHistoryScreen from '../screens/ExamHistoryScreen';
import WordbankPickerScreen from '../screens/WordbankPickerScreen';
import type { RootStackParamList, MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

// 统一的 Stack header 样式：所有栈屏一律显示标题栏（含返回按钮），Web 与移动端一致
const stackHeaderOptions = (title: string) => ({
  headerShown: true as boolean,
  title,
  headerStyle: {
    backgroundColor: '#1976D2',
  },
  headerTintColor: '#fff',
  headerTitleStyle: {
    fontWeight: 'bold' as const,
  },
});

// 主标签导航（4 个 Tab：学习 / 生词本 / 练习 / 我的）
// 图标名需精确匹配 MaterialIcons 的字面量联合类型，用查找表保证类型安全
const TAB_ICONS: Record<
  keyof MainTabParamList,
  React.ComponentProps<typeof MaterialIcons>['name']
> = {
  Home: 'home',
  Words: 'book',
  Practice: 'edit',
  Profile: 'account-circle',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
        tabBarActiveTintColor: '#1976D2',
        tabBarInactiveTintColor: '#757575',
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          paddingBottom: 4,
        },
        tabBarStyle: {
          height: 60,
          paddingTop: 6,
          paddingBottom: 8,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: '学习' }} />
      <Tab.Screen name="Words" component={WordListScreen} options={{ tabBarLabel: '生词本' }} />
      <Tab.Screen name="Practice" component={PracticeHubScreen} options={{ tabBarLabel: '练习' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: '我的' }} />
    </Tab.Navigator>
  );
}

// 主导航栈
export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="AddWord"
          component={AddWordScreen}
          options={stackHeaderOptions('添加生词')}
        />
        <Stack.Screen
          name="WordbankPicker"
          component={WordbankPickerScreen}
          options={stackHeaderOptions('从词库选词')}
        />
        <Stack.Screen
          name="Study"
          component={StudyScreen}
          options={stackHeaderOptions('开始学习')}
        />
        <Stack.Screen
          name="WordDetail"
          component={WordDetailScreen}
          options={stackHeaderOptions('单词详情')}
        />
        <Stack.Screen
          name="Stats"
          component={StatsScreen}
          options={stackHeaderOptions('学习统计')}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={stackHeaderOptions('设置')}
        />
        <Stack.Screen
          name="ArticleList"
          component={ArticleListScreen}
          options={stackHeaderOptions('趣味文章')}
        />
        <Stack.Screen
          name="ArticleGenerate"
          component={ArticleGenerateScreen}
          options={stackHeaderOptions('生成文章')}
        />
        <Stack.Screen
          name="ArticleDetail"
          component={ArticleDetailScreen}
          options={stackHeaderOptions('文章阅读')}
        />
        <Stack.Screen
          name="ExamSetup"
          component={ExamSetupScreen}
          options={stackHeaderOptions('考题练习')}
        />
        <Stack.Screen
          name="ExamAnswer"
          component={ExamAnswerScreen}
          options={stackHeaderOptions('答题中')}
        />
        <Stack.Screen
          name="ExamResult"
          component={ExamResultScreen}
          options={stackHeaderOptions('练习结果')}
        />
        <Stack.Screen
          name="WrongQuestionReview"
          component={WrongQuestionReviewScreen}
          options={stackHeaderOptions('错题复习')}
        />
        <Stack.Screen
          name="ExamHistory"
          component={ExamHistoryScreen}
          options={stackHeaderOptions('练习历史')}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
