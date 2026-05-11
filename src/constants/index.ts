export const WORD_CATEGORIES = {
  reading: '阅读生词',
  cloze: '完型生词',
  translation: '翻译生词',
  writing: '作文生词'
};

export const STUDY_MODES = {
  flashcard: '卡片背诵',
  listening: '听音背词',
  quiz: '考题练习'
};

export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30]; // 艾宾浩斯复习间隔（天）

export const API_CONFIG = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  DEFAULT_MODEL: 'anthropic/claude-3-haiku',
  MAX_RETRIES: 3,
  TIMEOUT: 10000
};

export const DB_CONFIG = {
  NAME: 'kaoyan_vocabulary.db',
  VERSION: 1
};

export const UI_CONFIG = {
  WORDS_PER_PAGE: 20,
  DAILY_NEW_WORDS_LIMIT: 50,
  MIN_CORRECT_RATE_FOR_ADVANCE: 0.8
};