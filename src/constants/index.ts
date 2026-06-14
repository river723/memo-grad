export const STUDY_MODES = {
  flashcard: '卡片背诵',
  listening: '听音背词',
  quiz: '考题练习'
};

export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30]; // 艾宾浩斯复习间隔（天）

export const AI_PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    keyPlaceholder: '输入 DeepSeek API 密钥',
    modelPlaceholder: 'deepseek-v4-flash',
    getKeyUrl: 'https://platform.deepseek.com/',
    helpText: '适合直接使用 DeepSeek 官方 API。'
  }
} as const;

export const API_CONFIG = {
  MAX_RETRIES: 3,
  TIMEOUT: 30000,
  BATCH_SIZE: 5,
  BATCH_MAX_TOKENS: 8000
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

export const EXAM_CONFIG = {
  DEFAULT_QUESTION_COUNT: 10,
  MIN_QUESTION_COUNT: 5,
  MAX_QUESTION_COUNT: 20,
  AUTO_ADVANCE_DELAY: 1500,  // 答完题后自动跳转的延迟（毫秒）
};

export const WRONG_QUESTION_MASTERY_THRESHOLD = 3; // 错题做对 3 次后自动移出