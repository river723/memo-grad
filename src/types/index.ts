export interface Word {
  id?: number;
  word: string;
  pronunciation_uk?: string;
  pronunciation_us?: string;
  definitions: WordDefinition[];
  etymology?: string;
  similar_words?: SimilarWord[];
  difficulty: number; // 1-5
  frequency: number; // 考研频次
  created_at?: string;
  updated_at?: string;
}

export interface WordDefinition {
  part_of_speech: string;
  meaning: string;
  example?: string;
  is_core?: boolean; // 是否为核心考研释义
  is_rare_sense?: boolean; // 是否为熟词僻义
}

export interface SimilarWord {
  word: string;
  relation: 'spelling' | 'meaning' | 'root';
  description: string;
}

export interface StudyRecord {
  id?: number;
  word_id: number;
  study_date: string;
  result: 0 | 1; // 0:错误, 1:正确
  study_mode: StudyMode;
}

export interface StudyPlan {
  id?: number;
  word_id: number;
  plan_date: string;
  plan_type: 'new' | 'review';
  completed: boolean;
}

export type StudyMode = 'flashcard' | 'listening' | 'quiz' | 'exam_quiz';

export type AIProviderId = 'deepseek';

export interface AppSettings {
  dailyNewWords: number;
  reviewInterval: number[];
  soundEnabled: boolean;
  autoPlaySound: boolean;
  theme: string;
  fontSize: number;
  showRareSense: boolean;
  showEtymology: boolean;
  apiKey: string;
  aiProvider: AIProviderId;
  aiModel: string;
  articleWordCount: number;
  articleLength: number;
  examQuestionCount: number;
}

export interface DailyStats {
  date: string;
  new_words: number;
  reviewed_words: number;
  correct_rate: number;
}

export interface WeeklyStudyTrend {
  date: string;
  dayLabel: string;
  studyCount: number;
  studiedWordCount: number;
  correctCount: number;
  accuracy: number | null;
  plannedCount: number;
  completedCount: number;
  completionRate: number | null;
}

export interface AIResponse {
  definitions: WordDefinition[];
  etymology?: string;
  similar_words?: SimilarWord[];
  examples?: string[];
  suggestedDifficulty?: number; // AI建议难度 1-5
}

export interface Article {
  id?: number;
  title: string;
  content: string;          // 文章正文（英文）
  translation: string;      // 文章中文翻译
  words: string[];          // 包含的生词
  word_ids: number[];       // 对应单词 ID
  theme: string;            // 文章主题（technology, life, history, nature, science, random）
  created_at: string;
  read_count: number;
  last_read_at?: string;
}

// 考题练习相关类型
export interface DefinitionQuestion {
  type: 'definition';
  word_id: number;
  word: string;                 // 目标生词
  sentence: string;             // 含划线生词的句子（用 *word* 标记）
  correct_definition: string;   // 正确的英文释义
  options: string[];            // 4 个英文释义选项（已打乱）
}

export interface ClozeQuestion {
  type: 'cloze';
  word_id: number;
  target_word: string;        // 正确答案（单词）
  sentence: string;           // 含 [BLANK] 的句子
  chinese_hint?: string;      // 中文语境提示
  options: string[];          // 4 个英文单词选项（已打乱）
  correct_answer: string;     // 正确选项
}

export type ExamQuestion = DefinitionQuestion | ClozeQuestion;

export interface ExamAnswer {
  question_index: number;
  question: ExamQuestion;
  selected_answer: string;
  is_correct: boolean;
}

export type ExamQuestionType = 'definition' | 'cloze';

// 一次练习的完整记录
export interface ExamSession {
  id?: number;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
  question_type: ExamQuestionType;
  accuracy: number;             // 0-1
  created_at: string;
}

// 错题本条目
export interface WrongQuestion {
  id?: number;
  question: ExamQuestion;       // 原始题目
  wrong_answer: string;         // 用户当时的错误答案
  correct_count: number;        // 累计做对次数（≥3 移除）
  wrong_count: number;          // 累计做错次数
  last_attempt_at: string;      // 最后尝试时间
  created_at: string;
}