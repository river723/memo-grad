export interface Word {
  id?: number;
  word: string;
  pronunciation_uk?: string;
  pronunciation_us?: string;
  definitions: WordDefinition[];
  etymology?: string;
  similar_words?: SimilarWord[];
  memory_tip?: string; // 记忆口诀/技巧
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

export type StudyMode = 'flashcard' | 'listening' | 'quiz' | 'exam_quiz' | 'real_exam';

export type AIProviderId = 'deepseek';

export interface AppSettings {
  dailyNewWords: number;
  reviewInterval: number[];
  soundEnabled: boolean;
  autoPlaySound: boolean;
  theme: 'light' | 'dark' | 'system';  // 支持浅色/深色/跟随系统三种模式
  fontSize: number;
  showRareSense: boolean;
  showEtymology: boolean;
  apiKey: string;
  aiProvider: AIProviderId;
  aiModel: string;
  articleWordCount: number;
  articleLength: number;
  examQuestionCount: number;
  examAutoAdvance: boolean; // 考题答对后是否自动跳转下一题（关闭则手动点击）
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
  examFrequency?: number; // 考研频次 1-5
  memoryTip?: string; // 记忆口诀/技巧
}

export interface WordDictEntry {
  definitions: WordDefinition[];
  etymology?: string;
  similar_words?: SimilarWord[];
  suggestedDifficulty?: number; // 本地词典建议难度 1-5
  examFrequency?: number; // 考研频次 1-5
  memoryTip?: string; // 记忆口诀/技巧
}

export interface WordDictJson {
  results: Record<string, WordDictEntry>;
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

// ==================== 真题练习相关类型 ====================
// 与考题练习完全独立：真题是"整篇文章挂多题"的结构，字段与 ExamQuestion 差异较大。

export type RealExamLetter = 'A' | 'B' | 'C' | 'D';

/** 段落级中英对照（结果页复习用；完形英文段中 [N] 表示挖空占位） */
export interface PassageParagraph {
  en: string;
  zh: string;
}

/** 阅读理解单题 */
export interface RealExamReadingQuestion {
  id: string;                 // 如 '2023-text1-q1'
  stem: string;               // 题干（英文）
  options: string[];          // 4 项，字符串已含 "A) ..." 前缀
  answer: RealExamLetter;     // 正确答案字母
  explanation?: string;       // 中文解析（可选）
}

/** 阅读理解一整篇 passage + 挂 4-5 题 */
export interface RealExamReadingPassage {
  id: string;                 // 如 '2023-text1'
  title?: string;             // 可选标题（如 "Text 1"）
  passage: string;            // 文章正文（英文原文）
  paragraphs?: PassageParagraph[]; // 段落级中英对照（结果页展示；答题屏不用）
  questions: RealExamReadingQuestion[];
}

/** 完形填空单空 */
export interface RealExamClozeBlank {
  index: number;              // 1..20
  options: string[];          // 4 项，字符串已含 "A) ..." 前缀
  answer: RealExamLetter;
  explanation?: string;       // 中文解析（可选）
}

/** 完形填空整篇 passage + 20 空 */
export interface RealExamClozePaper {
  id: string;                 // 如 '2023-cloze'
  passage: string;            // 含 "[1] ... [2] ..." 占位符的正文
  paragraphs?: PassageParagraph[]; // 段落级中英对照（结果页展示；答题屏不用）
  blanks: RealExamClozeBlank[];
}

/** 按年份组织的真题集（英语一 + 英语二） */
export interface RealExamYear {
  year: number;
  english1: {
    reading: RealExamReadingPassage[];    // 英语一通常 5 篇
    cloze: RealExamClozePaper | null;     // 英语一 1 篇完形
  };
  english2: {
    reading: RealExamReadingPassage[];    // 英语二通常 4 篇
    cloze: RealExamClozePaper | null;     // 英语二 1 篇完形
  };
}

/** 系列故事数据 */
export interface StoryChapter {
  id: number;
  title: string;
  content: string;           // 英文正文
  translation: string;       // 中文翻译
  words: string[];           // 本章目标词列表
  word_count: number;        // 正文字数
  theme: string;             // 主题
}

export interface StorySeries {
  series_title: string;
  total_chapters: number;
  total_words: number;
  chapters: StoryChapter[];
}

/** 获取某套试卷的阅读 passage 列表（用于 RealExamListScreen 展示计数） */
export interface RealExamPaperSet {
  reading: RealExamReadingPassage[];
  cloze: RealExamClozePaper | null;
}

export type RealExamMode = 'reading' | 'cloze';

/** 单题作答记录（阅读题 questionId 为 question.id；完形题 questionId 为 `${paperId}-b${index}`） */
export interface RealExamAnswerItem {
  questionId: string;
  selected: RealExamLetter | null;
  correct: boolean;
}

/** 一次真题练习会话 */
export interface RealExamSession {
  id: number;                       // 时间戳作为 id，避免依赖数据库自增
  year: number;
  mode: RealExamMode;
  paperId: string;                  // reading: passage.id；cloze: paper.id
  answers: RealExamAnswerItem[];
  score: number;                    // 正确数
  total: number;
  createdAt: string;                // ISO 时间串
}

/**
 * 真题错题条目——独立于单词错题本 WrongQuestion。
 * 以 questionId 作为主键（阅读 = RealExamReadingQuestion.id；完形 = `${paperId}-b${index}`）。
 * 题面/选项/解析做快照，避免 realExams.json 后续版本变化后错题失去上下文。
 */
export interface RealExamWrongQuestion {
  questionId: string;
  year: number;
  setId: 'english1' | 'english2';
  mode: RealExamMode;
  paperId: string;                  // 用于跳回 RealExamReading / RealExamCloze 重做
  paperTitle?: string;              // 阅读的 Text 标题；完形留空
  blankIndex?: number;              // 完形题号 1-20；阅读留空
  stem?: string;                    // 阅读题干；完形留空
  options: string[];                // 4 项（含 "A) " 前缀，直接沿用原字段）
  correctAnswer: RealExamLetter;
  userAnswer: RealExamLetter | null;
  explanation?: string;
  wrong_count: number;
  correct_count: number;            // 重做时递增；≥ WRONG_QUESTION_MASTERY_THRESHOLD 自动移除
  last_attempt_at: string;
  created_at: string;
}