import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type {
  ExamQuestion,
  ExamAnswer,
  ExamQuestionType,
  RealExamSession,
  RealExamReadingPassage,
  RealExamClozePaper,
} from '../types';

/**
 * 主 Tab 路由参数表。路由名统一为英文 PascalCase，中文仅作 tabBarLabel。
 * 四个 Tab 分别对应：学习（词汇）、阅读（文章）、练习（考题）、我的（数据+设置）。
 */
export type MainTabParamList = {
  Home: undefined;
  Read: undefined;
  Practice: undefined;
  Stats: undefined;
};

/**
 * 根 Stack 路由参数表。目前只包含 Main（Tab Navigator）。
 */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};

/** 各 Tab 内 Stack 的路由参数表 */
export type LearnStackParamList = {
  Home: undefined;
  Study: { wordIds?: number[] } | undefined;
  WordDetail: { wordId: number };
  AddWord: undefined;
  WordbankPicker: undefined;
  WordList: undefined;
  Dictionary: undefined;
  DictionaryBrowse: { dictId: string };
  DictionaryWordDetail: { word: string };
};

export type ReadStackParamList = {
  StoryList: undefined;
  StoryDetail: { chapterId: number };
  ArticleList: undefined;
  ArticleGenerate: undefined;
  ArticleDetail: { articleId: number };
};

export type PracticeStackParamList = {
  PracticeHub: undefined;
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
  RealExamList: undefined;
  RealExamReading: { year: number; setId: 'english1' | 'english2'; passageId: string };
  RealExamCloze: { year: number; setId: 'english1' | 'english2'; paperId: string };
  RealExamResult: {
    session: RealExamSession;
    passage?: RealExamReadingPassage;
    paper?: RealExamClozePaper;
  };
};

export type StatsStackParamList = {
  Stats: undefined;
  StatsDetail: undefined;
  Settings: undefined;
};

/** 根栈导航类型（用于跨 Tab 导航到 Main）。 */
export type RootNavigation = StackNavigationProp<RootStackParamList>;

/** 学习 Tab 内导航类型。 */
export type LearnNavigation = StackNavigationProp<LearnStackParamList>;

/** 阅读 Tab 内导航类型。 */
export type ReadNavigation = StackNavigationProp<ReadStackParamList>;

/** 练习 Tab 内导航类型。 */
export type PracticeNavigation = StackNavigationProp<PracticeStackParamList>;

/** 统计 Tab 内导航类型。 */
export type StatsNavigation = StackNavigationProp<StatsStackParamList>;

/** 所有屏幕名联合。 */
export type AllScreenNames =
  | keyof RootStackParamList
  | keyof LearnStackParamList
  | keyof ReadStackParamList
  | keyof PracticeStackParamList
  | keyof StatsStackParamList;

/**
 * 类型安全的导航 hook。
 * 使用 any 是因为 React Navigation 的类型系统在嵌套导航场景下，
 * union/intersection 类型会导致 navigate() 签名无法调和。
 * 运行时一切正常，类型上我们信任 navigate(screenName, params) 的调用。
 */
export const useAppNavigation = () => useNavigation<any>();

/**
 * 类型安全的路由 hook。
 * 使用 any 同理，避免嵌套栈参数类型无法推断的问题。
 */
export const useAppRoute = <T extends AllScreenNames>() =>
  useRoute<RouteProp<Record<T, any>, T>>();
