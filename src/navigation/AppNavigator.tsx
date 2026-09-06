import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppIcon, { type IconName } from '../components/ds/AppIcon';
import { useAppTheme, lightNavTheme, darkNavTheme } from '../theme/theme';
import { palette } from '../theme/tokens';
import { useAuth } from '../providers/AuthProvider';
import { OFFLINE_MODE } from '../config/appMode';
import LoginScreen from '../screens/LoginScreen';

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
import ExamSetBankScreen from '../screens/ExamSetBankScreen';
import ExamSetDetailScreen from '../screens/ExamSetDetailScreen';
import RealExamListScreen from '../screens/RealExamListScreen';
import RealExamReadingScreen from '../screens/RealExamReadingScreen';
import RealExamClozeScreen from '../screens/RealExamClozeScreen';
import RealExamNewTypeScreen from '../screens/RealExamNewTypeScreen';
import RealExamTranslationScreen from '../screens/RealExamTranslationScreen';
import RealExamWritingScreen from '../screens/RealExamWritingScreen';
import RealExamResultScreen from '../screens/RealExamResultScreen';

// --- 我的 Tab 组件 ---
import StatsScreen from '../screens/StatsScreen';
import StatsDetailScreen from '../screens/StatsDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminScreen from '../screens/AdminScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';

import type {
  RootStackParamList,
  MainTabParamList,
  LearnStackParamList,
  ReadStackParamList,
  PracticeStackParamList,
  StatsStackParamList,
} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createStackNavigator<RootStackParamList>();

/**
 * Tab Stack 内的 header 配置工厂（已收敛）。
 * - 墨绿背景（colors.primary）+ 白字 + icon
 * - 字号走 typography.title token
 * - 隐藏底部 1px hairline（headerShadowVisible: false）
 */
function makeTabHeaderOptions(title: string, icon: IconName) {
  return {
    headerTitle: () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { colors } = useAppTheme();
      const typography = colors.typography;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppIcon name={icon} size={20} color={colors.onPrimary} />
          <Text
            style={{
              color: colors.onPrimary,
              fontSize: typography.title.size,
              lineHeight: typography.title.lineHeight,
              fontWeight: '600',
              letterSpacing: 0.2,
            }}
          >
            {title}
          </Text>
        </View>
      );
    },
    headerStyle: { backgroundColor: palette.primary },
    headerTintColor: palette.onPrimary,
    headerBackTitleVisible: false,
    headerShadowVisible: false,
  };
}

// ==================== 学习 Tab ====================
function LearnStack() {
  const Stack = createStackNavigator<LearnStackParamList>();
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={makeTabHeaderOptions('学习', 'book-open-page-variant')} />
      <Stack.Screen name="Study" component={StudyScreen} options={makeTabHeaderOptions('开始学习', 'book-open-page-variant')} />
      <Stack.Screen name="WordDetail" component={WordDetailScreen} options={makeTabHeaderOptions('单词详情', 'book-open-variant')} />
      <Stack.Screen name="AddWord" component={AddWordScreen} options={makeTabHeaderOptions('添加生词', 'plus-box')} />
      <Stack.Screen name="WordbankPicker" component={WordbankPickerScreen} options={makeTabHeaderOptions('从词库选词', 'book-multiple')} />
      <Stack.Screen name="WordList" component={WordListScreen} options={makeTabHeaderOptions('生词本', 'book-open-variant')} />
      <Stack.Screen name="Dictionary" component={DictionaryScreen} options={makeTabHeaderOptions('词库', 'library')} />
      <Stack.Screen name="DictionaryBrowse" component={DictionaryBrowseScreen} options={makeTabHeaderOptions('浏览词库', 'library')} />
      <Stack.Screen name="DictionaryWordDetail" component={DictionaryWordDetailScreen} options={makeTabHeaderOptions('单词详情', 'book-open-variant')} />
    </Stack.Navigator>
  );
}

// ==================== 阅读 Tab ====================
function ReadStack() {
  const Stack = createStackNavigator<ReadStackParamList>();
  return (
    <Stack.Navigator>
      <Stack.Screen name="ReadHome" component={ReadHomeScreen} options={makeTabHeaderOptions('阅读', 'book-open-page-variant-outline')} />
      <Stack.Screen name="StoryDetail" component={StoryDetailScreen} options={makeTabHeaderOptions('故事阅读', 'book-open-page-variant')} />
      <Stack.Screen name="ArticleGenerate" component={ArticleGenerateScreen} options={makeTabHeaderOptions('生成文章', 'file-document-edit')} />
      <Stack.Screen name="ArticleDetail" component={ArticleDetailScreen} options={makeTabHeaderOptions('文章阅读', 'file-document')} />
    </Stack.Navigator>
  );
}

// ==================== 练习 Tab ====================
function PracticeStack() {
  const Stack = createStackNavigator<PracticeStackParamList>();
  return (
    <Stack.Navigator>
      <Stack.Screen name="PracticeHub" component={PracticeHubScreen} options={makeTabHeaderOptions('练习', 'puzzle')} />
      <Stack.Screen name="ExamSetup" component={ExamSetupScreen} options={makeTabHeaderOptions('AI出题练习', 'puzzle')} />
      <Stack.Screen name="ExamAnswer" component={ExamAnswerScreen} options={makeTabHeaderOptions('答题中', 'puzzle')} />
      <Stack.Screen name="ExamResult" component={ExamResultScreen} options={makeTabHeaderOptions('练习结果', 'chart-bar')} />
      <Stack.Screen
        name="WrongQuestionReview"
        component={WrongQuestionReviewScreen}
        options={({ navigation }) => ({
          ...makeTabHeaderOptions('错题本', 'alert-circle'),
          headerLeft: () => (
            <TouchableOpacity
              accessibilityLabel="返回练习页面"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => navigation.navigate('PracticeHub')}
              style={{ paddingLeft: 12, paddingRight: 8, paddingVertical: 4 }}
            >
              <AppIcon name="arrow-left" size={24} color={palette.onPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="ExamHistory" component={ExamHistoryScreen} options={makeTabHeaderOptions('练习历史', 'history')} />
      <Stack.Screen name="ExamSetBank" component={ExamSetBankScreen} options={makeTabHeaderOptions('AI 题库', 'library')} />
      <Stack.Screen name="ExamSetDetail" component={ExamSetDetailScreen} options={makeTabHeaderOptions('套题详情', 'card-text')} />
      <Stack.Screen name="RealExamList" component={RealExamListScreen} options={makeTabHeaderOptions('真题练习', 'book-open-page-variant')} />
      <Stack.Screen name="RealExamReading" component={RealExamReadingScreen} options={makeTabHeaderOptions('阅读理解', 'book-open-page-variant')} />
      <Stack.Screen name="RealExamCloze" component={RealExamClozeScreen} options={makeTabHeaderOptions('完形填空', 'book-open-page-variant')} />
      <Stack.Screen name="RealExamNewType" component={RealExamNewTypeScreen} options={makeTabHeaderOptions('新题型', 'book-open-page-variant')} />
      <Stack.Screen name="RealExamTranslation" component={RealExamTranslationScreen} options={makeTabHeaderOptions('翻译', 'translate')} />
      <Stack.Screen name="RealExamWriting" component={RealExamWritingScreen} options={makeTabHeaderOptions('写作', 'pencil')} />
      <Stack.Screen name="RealExamResult" component={RealExamResultScreen} options={makeTabHeaderOptions('练习结果', 'chart-bar')} />
    </Stack.Navigator>
  );
}

// ==================== 统计 Tab ====================
function StatsStack() {
  const Stack = createStackNavigator<StatsStackParamList>();
  return (
    <Stack.Navigator>
      <Stack.Screen name="Stats" component={StatsScreen} options={makeTabHeaderOptions('我的', 'account')} />
      <Stack.Screen
        name="StatsDetail"
        component={StatsDetailScreen}
        options={({ navigation }) => ({
          ...makeTabHeaderOptions('学习统计', 'chart-line'),
          headerLeft: () => (
            <TouchableOpacity
              accessibilityLabel="返回我的页面"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => navigation.navigate('Stats')}
              style={{ paddingLeft: 12, paddingRight: 8, paddingVertical: 4 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.onPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={makeTabHeaderOptions('设置', 'cog')} />
      <Stack.Screen name="Admin" component={AdminScreen} options={makeTabHeaderOptions('后台控制台', 'shield-crown')} />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={({ navigation }) => ({
          ...makeTabHeaderOptions('订阅方案', 'card-account-details'),
          headerLeft: () => (
            <TouchableOpacity
              accessibilityLabel="返回我的页面"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => navigation.navigate('Stats')}
              style={{ paddingLeft: 12, paddingRight: 8, paddingVertical: 4 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={palette.onPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
    </Stack.Navigator>
  );
}

// ==================== 主 Tab 导航器 ====================
const TAB_ICONS: Record<string, IconName> = {
  Home: 'book-open-page-variant',
  Read: 'book-open-page-variant-outline',
  Practice: 'puzzle',
  Stats: 'account',
};

function MainTabs() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => (
          <AppIcon
            name={TAB_ICONS[route.name]}
            size={size}
            color={color}
          />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tertiary,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: typography.caption.size,
          fontWeight: '500',
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
      <Tab.Screen
        name="Practice"
        component={PracticeStack}
        options={{ tabBarLabel: '练习' }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // 从其它 tab 切回「练习」时落到练习主页（栈底 PracticeHub），
            // 避免停在 AI 出题/真题等上次停留的子页（bottom-tabs 默认保留子栈状态）。
            // 已在练习 tab 内重复点击时保持默认 popToTop 行为。
            if (!navigation.isFocused()) {
              e.preventDefault();
              navigation.dispatch(
                CommonActions.navigate('Practice', { screen: 'PracticeHub' })
              );
            }
          },
        })}
      />
      <Tab.Screen name="Stats" component={StatsStack} options={{ tabBarLabel: '我的' }} />
    </Tab.Navigator>
  );
}

// ==================== 根导航器 ====================
export default function AppNavigator() {
  const { dark, colors } = useAppTheme();
  const { user, loading } = useAuth();

  // web/桌面端专用：原生 RN 没有 document，直接跳过。
  // 此前未加判断，iOS/Android 启动即抛 ReferenceError（document is not defined）：
  // Release 下未捕获 JS 异常会走 ExceptionsManager.reportFatalException → RCTFatal → abort，
  // 表现为启动后约 200ms 在 com.meta.react.turbomodulemanager.queue 上闪退。
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const title = OFFLINE_MODE ? '考研单词·离线版' : '考研单词·在线版';
    document.title = title;
    const interval = setInterval(() => {
      if (document.title !== title) {
        document.title = title;
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ fontSize: 18, color: colors.onSurface }}>
          加载中...
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={dark ? darkNavTheme : lightNavTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Auth" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
