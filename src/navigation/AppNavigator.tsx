import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Web 平台兼容性处理
const isWeb = typeof window !== 'undefined';

import HomeScreen from '../screens/HomeScreen';
import AddWordScreen from '../screens/AddWordScreen';
import StudyScreen from '../screens/StudyScreen';
import StatsScreen from '../screens/StatsScreen';
import WordListScreen from '../screens/WordListScreen';
import WordDetailScreen from '../screens/WordDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ArticleListScreen from '../screens/ArticleListScreen';
import ArticleGenerateScreen from '../screens/ArticleGenerateScreen';
import ArticleDetailScreen from '../screens/ArticleDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function HomeTabScreen() {
  return <HomeScreen />;
}

function WordListTabScreen() {
  return <WordListScreen />;
}

function StudyTabScreen() {
  return <StudyScreen />;
}

function StatsTabScreen() {
  return <StatsScreen />;
}

function SettingsTabScreen() {
  return <SettingsScreen />;
}

// 主标签导航
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';

          if (route.name === '首页') {
            iconName = 'home';
          } else if (route.name === '单词本') {
            iconName = 'book';
          } else if (route.name === '学习') {
            iconName = 'school';
          } else if (route.name === '统计') {
            iconName = 'bar-chart';
          } else if (route.name === '设置') {
            iconName = 'settings';
          }

          return <Icon name={iconName} size={size} color={color} />;
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
      <Tab.Screen name="单词本" component={WordListTabScreen} />
      <Tab.Screen name="学习" component={StudyTabScreen} />
      <Tab.Screen name="统计" component={StatsTabScreen} />
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
          options={{
            headerShown: !isWeb,
            title: '添加单词',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="Study"
          component={StudyScreen}
          options={{
            headerShown: !isWeb,
            title: '开始学习',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="WordList"
          component={WordListScreen}
          options={{
            headerShown: !isWeb,
            title: '单词本',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="WordDetail"
          component={WordDetailScreen}
          options={{
            headerShown: !isWeb,
            title: '单词详情',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="Stats"
          component={StatsScreen}
          options={{
            headerShown: !isWeb,
            title: '学习统计',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: !isWeb,
            title: '设置',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="ArticleList"
          component={ArticleListScreen}
          options={{
            headerShown: true,
            title: '趣味文章',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="ArticleGenerate"
          component={ArticleGenerateScreen}
          options={{
            headerShown: true,
            title: '生成文章',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
        <Stack.Screen
          name="ArticleDetail"
          component={ArticleDetailScreen}
          options={{
            headerShown: true,
            title: '文章阅读',
            headerStyle: {
              backgroundColor: '#1976D2',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}