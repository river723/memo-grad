import React from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme, lightNavTheme, darkNavTheme } from '../theme/theme';

// --- 学习 Tab 组件 ---
import HomeScreen from '../screens/HomeScreen';
import AddWordScreen from '../screens/AddWordScreen';
import StudyScreen from '../screens/StudyScreen';
import WordListScreen from '../screens/WordListScreen';
import WordDetailScreen from '../screens/WordDetailScreen';
import WordbankPickerScreen from '../screens/WordbankPickerScreen';
import DictionaryScreen from '../screens/DictionaryScreen';
import DictionaryBrowseScreen from '../screens/DictionaryBrowseScreen';
import DictionaryWordDetailScreen from '../screens/DictionaryWordDetailScreen';

// --- 阅读 Tab 组件 ---
import ReadHomeScreen from '../screens/ReadHomeScreen';
import StoryDetailScreen from '../screens/StoryDetailScreen';
import ArticleGenerateScreen from '../screens/ArticleGenerateScreen';
import ArticleDetailScreen from '../screens/ArticleDetailScreen';

// --- 练习 Tab 组件 ---
import PracticeHubScreen from '../screens/PracticeHubScreen';
import ExamSetupScreen from '../screens/ExamSetupScreen';
import ExamAnswerScreen from '../screens/ExamAnswerScreen';
import ExamResultScreen from '../screens/ExamResultScreen';
import WrongQuestionReviewScreen from '../screens/WrongQuestionReviewScreen';
import ExamHistoryScreen from '../screens/ExamHistoryScreen';
import RealExamListScreen from '../screens/RealExamListScreen';
import RealExamReadingScreen from '../screens/RealExamReadingScreen';
import RealExamClozeScreen from '../screens/RealExamClozeScreen';
import RealExamResultScreen from '../screens/RealExamResultScreen';

// --- 我的 Tab 组件 ---
import StatsScreen from '../screens/StatsScreen';
import StatsDetailScreen from '../screens/StatsDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';

import type { RootStackParamList, MainTabParamList, LearnStackParamList, ReadStackParamList, PracticeStackParamList, StatsStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createStackNavigator<RootStackParamList>();

// ==================== 学习 Tab ====================
function LearnStack() {
  const { colors } = useAppTheme();
  const Stack = createStackNavigator<LearnStackParamList>();

  const headerOptions = (title: string, icon: string) => ({
    headerTitle: ({ color }: { color: string }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialIcons name={icon as any} size={22} color={color} />
        <Text style={{ color, fontWeight: 'bold', fontSize: 17 }}>{title}</Text>
      </View>
    ),
    headerStyle: {
      backgroundColor: colors.primary,
    },
    headerTintColor: '#ffffff',
    headerTitleStyle: {
      fontWeight: 'bold' as const,
    },
    headerBackTitleVisible: false,
  } as any);

  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={headerOptions('学习', 'menu-book')} />
      <Stack.Screen name="Study" component={StudyScreen} options={headerOptions('开始学习', 'menu-book')} />
      <Stack.Screen name="WordDetail" component={WordDetailScreen} options={headerOptions('单词详情', 'menu-book')} />
      <Stack.Screen name="AddWord" component={AddWordScreen} options={headerOptions('添加生词', 'plus')} />
      <Stack.Screen name="WordbankPicker" component={WordbankPickerScreen} options={headerOptions('从词库选词', 'menu-book')} />
      <Stack.Screen name="WordList" component={WordListScreen} options={headerOptions('生词本', 'menu-book')} />
      <Stack.Screen name="Dictionary" component={DictionaryScreen} options={headerOptions('词库', 'menu-book')} />
      <Stack.Screen name="DictionaryBrowse" component={DictionaryBrowseScreen} options={headerOptions('浏览词库', 'menu-book')} />
      <Stack.Screen name="DictionaryWordDetail" component={DictionaryWordDetailScreen} options={headerOptions('单词详情', 'menu-book')} />
    </Stack.Navigator>
  );
}

// ==================== 阅读 Tab ====================
function ReadStack() {
  const { colors } = useAppTheme();
  const Stack = createStackNavigator<ReadStackParamList>();

  const headerOptions = (title: string, icon: string) => ({
    headerTitle: ({ color }: { color: string }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialIcons name={icon as any} size={22} color={color} />
        <Text style={{ color, fontWeight: 'bold', fontSize: 17 }}>{title}</Text>
      </View>
    ),
    headerStyle: {
      backgroundColor: colors.primary,
    },
    headerTintColor: '#ffffff',
    headerTitleStyle: {
      fontWeight: 'bold' as const,
    },
    headerBackTitleVisible: false,
  } as any);

  return (
    <Stack.Navigator>
      <Stack.Screen name="ReadHome" component={ReadHomeScreen} options={headerOptions('阅读', 'auto-stories')} />
      <Stack.Screen name="StoryDetail" component={StoryDetailScreen} options={headerOptions('故事阅读', 'auto-stories')} />
      <Stack.Screen name="ArticleGenerate" component={ArticleGenerateScreen} options={headerOptions('生成文章', 'article')} />
      <Stack.Screen name="ArticleDetail" component={ArticleDetailScreen} options={headerOptions('文章阅读', 'article')} />
    </Stack.Navigator>
  );
}

// ==================== 练习 Tab ====================
function PracticeStack() {
  const { colors } = useAppTheme();
  const Stack = createStackNavigator<PracticeStackParamList>();

  const headerOptions = (title: string, icon: string) => ({
    headerTitle: ({ color }: { color: string }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialIcons name={icon as any} size={22} color={color} />
        <Text style={{ color, fontWeight: 'bold', fontSize: 17 }}>{title}</Text>
      </View>
    ),
    headerStyle: {
      backgroundColor: colors.primary,
    },
    headerTintColor: '#ffffff',
    headerTitleStyle: {
      fontWeight: 'bold' as const,
    },
    headerBackTitleVisible: false,
  } as any);

  return (
    <Stack.Navigator>
      <Stack.Screen name="PracticeHub" component={PracticeHubScreen} options={headerOptions('练习', 'edit-note')} />
      <Stack.Screen name="ExamSetup" component={ExamSetupScreen} options={headerOptions('考题练习', 'edit-note')} />
      <Stack.Screen name="ExamAnswer" component={ExamAnswerScreen} options={headerOptions('答题中', 'edit-note')} />
      <Stack.Screen name="ExamResult" component={ExamResultScreen} options={headerOptions('练习结果', 'edit-note')} />
      <Stack.Screen name="WrongQuestionReview" component={WrongQuestionReviewScreen} options={headerOptions('错题本', 'edit-note')} />
      <Stack.Screen name="ExamHistory" component={ExamHistoryScreen} options={headerOptions('练习历史', 'edit-note')} />
      <Stack.Screen name="RealExamList" component={RealExamListScreen} options={headerOptions('真题练习', 'menu-book')} />
      <Stack.Screen name="RealExamReading" component={RealExamReadingScreen} options={headerOptions('阅读理解', 'menu-book')} />
      <Stack.Screen name="RealExamCloze" component={RealExamClozeScreen} options={headerOptions('完形填空', 'menu-book')} />
      <Stack.Screen name="RealExamResult" component={RealExamResultScreen} options={headerOptions('练习结果', 'menu-book')} />
    </Stack.Navigator>
  );
}

// ==================== 统计 Tab ====================
function StatsStack() {
  const { colors } = useAppTheme();
  const Stack = createStackNavigator<StatsStackParamList>();

  const headerOptions = (title: string, icon: string) => ({
    headerTitle: ({ color }: { color: string }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialIcons name={icon as any} size={22} color={color} />
        <Text style={{ color, fontWeight: 'bold', fontSize: 17 }}>{title}</Text>
      </View>
    ),
    headerStyle: {
      backgroundColor: colors.primary,
    },
    headerTintColor: '#ffffff',
    headerTitleStyle: {
      fontWeight: 'bold' as const,
    },
    headerBackTitleVisible: false,
  } as any);

  return (
    <Stack.Navigator>
      <Stack.Screen name="Stats" component={StatsScreen} options={headerOptions('我的', 'person')} />
      <Stack.Screen name="StatsDetail" component={StatsDetailScreen} options={headerOptions('学习统计', 'bar-chart')} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={headerOptions('设置', 'settings')} />
    </Stack.Navigator>
  );
}

// ==================== 主 Tab 导航器 ====================

// 图标名映射
const TAB_ICONS: Record<string, string> = {
  Home: 'menu-book',
  Read: 'article',
  Practice: 'edit-note',
  Stats: 'person',
};

function MainTabs() {
  const { colors, dark } = useAppTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name={TAB_ICONS[route.name] as any} size={size} color={color} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tertiary,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          paddingBottom: 4,
        },
        tabBarStyle: {
          height: 60,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
        },
      })}
    >
      <Tab.Screen name="Home" component={LearnStack} options={{ tabBarLabel: '学习' }} />
      <Tab.Screen name="Read" component={ReadStack} options={{ tabBarLabel: '阅读' }} />
      <Tab.Screen name="Practice" component={PracticeStack} options={{ tabBarLabel: '练习' }} />
      <Tab.Screen name="Stats" component={StatsStack} options={{ tabBarLabel: '我的' }} />
    </Tab.Navigator>
  );
}

// ==================== 根导航器 ====================
export default function AppNavigator() {
  const { dark } = useAppTheme();
  return (
    <NavigationContainer theme={dark ? darkNavTheme : lightNavTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
