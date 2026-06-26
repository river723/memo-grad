import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ExamQuestion, ExamAnswer, ExamQuestionType } from '../types';

/**
 * 主 Tab 路由参数表。路由名统一为英文 PascalCase，中文仅作 tabBarLabel。
 */
export type MainTabParamList = {
  Home: undefined;
  Words: undefined;
  Practice: undefined;
  Profile: undefined;
};

/**
 * 根 Stack 路由参数表。路由名统一为英文 PascalCase，中文仅作 header title。
 * `Main` 是承载 Tab 导航的栈屏，接受嵌套导航参数（如 { screen: 'Words' }）。
 */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  AddWord: undefined;
  WordbankPicker: undefined;
  Study: { wordIds?: number[] } | undefined;
  WordDetail: { wordId: number };
  Stats: undefined;
  Settings: undefined;
  ArticleList: undefined;
  ArticleGenerate: undefined;
  ArticleDetail: { articleId: number };
  ExamSetup: undefined;
  ExamAnswer: {
    questions: ExamQuestion[];
    questionType: ExamQuestionType;
    sessionId?: number;
  };
  ExamResult: {
    questions: ExamQuestion[];
    answers: ExamAnswer[];
    questionType: ExamQuestionType;
    sessionId?: number;
  };
  WrongQuestionReview: undefined;
  ExamHistory: undefined;
};

/** 所有屏幕的导航类型：根栈导航即可覆盖全部跳转目标（含 Main 嵌套跳转）。 */
export type AppNavigation = StackNavigationProp<RootStackParamList>;

export type AppRouteProp<T extends keyof RootStackParamList> = RouteProp<
  RootStackParamList,
  T
>;

/** 类型安全的导航 hook，替代 useNavigation<any>()。 */
export const useAppNavigation = () => useNavigation<AppNavigation>();

/**
 * 类型安全的路由 hook，替代 useRoute<any>()。
 * 用法：const route = useAppRoute<'WordDetail'>(); route.params.wordId
 */
export const useAppRoute = <T extends keyof RootStackParamList>() =>
  useRoute<AppRouteProp<T>>();
