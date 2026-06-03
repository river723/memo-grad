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

export type StudyMode = 'flashcard' | 'listening' | 'quiz';

export interface DailyStats {
  date: string;
  new_words: number;
  reviewed_words: number;
  correct_rate: number;
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