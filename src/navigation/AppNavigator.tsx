import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';

// Web 平台兼容性处理
const isWeb = typeof window !== 'undefined';

import HomeScreen from '../screens/HomeScreen';
import AddWordScreen from '../screens/AddWordScreen';
import StudyScreen from '../screens/StudyScreen';
import StatsScreen from '../screens/StatsScreen';
import WordListScreen from '../screens/WordListScreen';
import WordDetailScreen from '../screens/WordDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PracticeHubScreen from '../screens/PracticeHubScreen';
import ArticleListScreen from '../screens/ArticleListScreen';
import ArticleGenerateScreen from '../screens/ArticleGenerateScreen';
import ArticleDetailScreen from '../screens/ArticleDetailScreen';
import ExamSetupScreen from '../screens/ExamSetupScreen';
import ExamAnswerScreen from '../screens/ExamAnswerScreen';
import ExamResultScreen from '../screens/ExamResultScreen';
import WrongQuestionReviewScreen from '../screens/WrongQuestionReviewScreen';
import ExamHistoryScreen from '../screens/ExamHistoryScreen';
import WordbankPickerScreen from '../screens/WordbankPickerScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function HomeTabScreen() {
  return <HomeScreen />;
}

function WordListTabScreen() {
  return <WordListScreen />;
}

function PracticeHubTabScreen() {
  return <PracticeHubScreen />;
}

function SettingsTabScreen() {
  return <SettingsScreen />;
}

// 统一的 Stack header 样式
const stackHeaderOptions = (title: string) => ({
  headerShown: !isWeb as boolean,
  title,
  headerStyle: {
    backgroundColor: '#1976D2',
  },
  headerTintColor: '#fff',
  headerTitleStyle: {
    fontWeight: 'bold' as const,
  },
});

// 主标签导航（4 个 Tab）
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';

          if (route.name === '首页') {
            iconName = 'home';
          } else if (route.name === '生词本') {
            iconName = 'book';
          } else if (route.name === '练习') {
            iconName = 'edit';
          } else if (route.name === '设置') {
            iconName = 'settings';
          }

          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
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
      <Tab.Screen name="首页" component={HomeTabScreen} />
      <Tab.Screen name="生词本" component={WordListTabScreen} />
      <Tab.Screen name="练习" component={PracticeHubTabScreen} />
      <Tab.Screen name="设置" component={SettingsTabScreen} />
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
          options={{ ...stackHeaderOptions('添加生词'), headerShown: true }}
        />
        <Stack.Screen
          name="WordbankPicker"
          component={WordbankPickerScreen}
          options={{ ...stackHeaderOptions('从词库选词'), headerShown: true }}
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
          options={{ ...stackHeaderOptions('学习统计'), headerShown: true }}
        />
        <Stack.Screen
          name="ArticleList"
          component={ArticleListScreen}
          options={{
            ...stackHeaderOptions('趣味文章'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="ArticleGenerate"
          component={ArticleGenerateScreen}
          options={{
            ...stackHeaderOptions('生成文章'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="ArticleDetail"
          component={ArticleDetailScreen}
          options={{
            ...stackHeaderOptions('文章阅读'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="ExamSetup"
          component={ExamSetupScreen}
          options={{
            ...stackHeaderOptions('考题练习'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="ExamAnswer"
          component={ExamAnswerScreen}
          options={{
            ...stackHeaderOptions('答题中'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="ExamResult"
          component={ExamResultScreen}
          options={{
            ...stackHeaderOptions('练习结果'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="WrongQuestionReview"
          component={WrongQuestionReviewScreen}
          options={{
            ...stackHeaderOptions('错题复习'),
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="ExamHistory"
          component={ExamHistoryScreen}
          options={{
            ...stackHeaderOptions('练习历史'),
            headerShown: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
