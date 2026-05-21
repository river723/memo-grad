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
  // 使用NVIDIA API端点
  OPENROUTER_BASE_URL: 'https://integrate.api.nvidia.com/v1',
  DEFAULT_MODEL: 'meta/llama-3.1-8b-instruct', // NVIDIA API支持的模型
  MAX_RETRIES: 3,
  TIMEOUT: 30000 // 增加超时时间
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