import { Word, StudyRecord, StudyPlan, Article, ExamSession, WrongQuestion, AppSettings, AIProviderId, RealExamSession, RealExamWrongQuestion, RealExamReadingPassage, RealExamClozePaper, RealExamNewTypePaper, RealExamLetter, RealExamOptionLetter } from '../types';
import { AI_PROVIDERS, WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';

// 跨平台存储接口
interface StorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}

// 根据平台选择存储实现
let AsyncStorage: StorageInterface;

if (typeof window !== 'undefined') {
  // Web环境或React Native环境
  const RNAsyncStorage = require('@react-native-async-storage/async-storage');
  AsyncStorage = RNAsyncStorage.default || RNAsyncStorage;
} else {
  // Node.js环境 - 使用内存存储进行测试
  console.log('StorageService: Node.js环境检测 - 使用内存存储');

  const memoryStorage = new Map<string, string>();

  AsyncStorage = {
    getItem: async (key: string) => {
      return memoryStorage.get(key) || null;
    },
    setItem: async (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      memoryStorage.delete(key);
    },
    multiRemove: async (keys: string[]) => {
      keys.forEach(key => memoryStorage.delete(key));
    }
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  dailyNewWords: 10,
  reviewInterval: [1, 2, 4, 7, 15],
  soundEnabled: true,
  autoPlaySound: false,
  theme: 'light',
  fontSize: 14,
  showRareSense: true,
  showEtymology: true,
  apiKey: '',
  aiProvider: 'deepseek',
  aiModel: AI_PROVIDERS.deepseek.defaultModel,
  articleWordCount: 10,
  articleLength: 200,
  examQuestionCount: 10,
  examAutoAdvance: true,
};

class StorageService {
  private static instance: StorageService;

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // 存储键名
  private readonly KEYS = {
    WORDS: 'kaoyan_words',
    STUDY_RECORDS: 'kaoyan_study_records',
    STUDY_PLANS: 'kaoyan_study_plans',
    SETTINGS: 'kaoyan_settings',
    ARTICLES: 'kaoyan_articles',
    EXAM_SESSIONS: 'kaoyan_exam_sessions',
    WRONG_QUESTIONS: 'kaoyan_wrong_questions',
    IGNORED_WORDBANK_WORDS: 'kaoyan_ignored_wordbank_words',
    REAL_EXAM_SESSIONS: 'kaoyan_real_exam_sessions',
    REAL_EXAM_WRONG_QUESTIONS: 'kaoyan_real_exam_wrong_questions',
    REAL_EXAM_DRAFTS: 'kaoyan_real_exam_drafts'
  };

  // 生词操作
  async addWord(word: Omit<Word, 'id'>): Promise<number> {
    const words = await this.getWords();
    const newId = words.length > 0 ? Math.max(...words.map(w => w.id!)) + 1 : 1;

    const newWord: Word = {
      ...word,
      id: newId,
      similar_words: Array.isArray(word.similar_words) ? word.similar_words : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    words.push(newWord);
    await AsyncStorage.setItem(this.KEYS.WORDS, JSON.stringify(words));
    return newId;
  }

  async getWords(): Promise<Word[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.WORDS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get words error:', error);
      return [];
    }
  }

  async getWordById(id: number): Promise<Word | null> {
    const words = await this.getWords();
    return words.find(word => word.id === id) || null;
  }

  async searchWords(query: string): Promise<Word[]> {
    const words = await this.getWords();
    return words.filter(word =>
      word.word.toLowerCase().includes(query.toLowerCase())
    );
  }

  async updateWord(id: number, updates: Partial<Word>): Promise<void> {
    const words = await this.getWords();
    const index = words.findIndex(word => word.id === id);

    if (index !== -1) {
      words[index] = {
        ...words[index],
        ...updates,
        updated_at: new Date().toISOString()
      };
      await AsyncStorage.setItem(this.KEYS.WORDS, JSON.stringify(words));
    }
  }

  async deleteWord(id: number): Promise<void> {
    const words = await this.getWords();
    const filtered = words.filter(word => word.id !== id);
    await AsyncStorage.setItem(this.KEYS.WORDS, JSON.stringify(filtered));
  }

  // 词库忽略词操作
  async getIgnoredWordbankWords(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.IGNORED_WORDBANK_WORDS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get ignored wordbank words error:', error);
      return [];
    }
  }

  async addIgnoredWordbankWords(words: string[]): Promise<void> {
    const current = await this.getIgnoredWordbankWords();
    const next = new Set(current.map(word => word.toLowerCase()));
    words.forEach(word => next.add(word.toLowerCase()));
    await AsyncStorage.setItem(
      this.KEYS.IGNORED_WORDBANK_WORDS,
      JSON.stringify(Array.from(next))
    );
  }

  async clearIgnoredWordbankWords(): Promise<void> {
    await AsyncStorage.removeItem(this.KEYS.IGNORED_WORDBANK_WORDS);
  }

  // 学习记录操作
  async addStudyRecord(record: Omit<StudyRecord, 'id'>): Promise<void> {
    const records = await this.getStudyRecords();
    const newId = records.length > 0 ? Math.max(...records.map(r => r.id!)) + 1 : 1;

    const newRecord: StudyRecord = {
      ...record,
      id: newId
    };

    records.push(newRecord);
    await AsyncStorage.setItem(this.KEYS.STUDY_RECORDS, JSON.stringify(records));
  }

  async getStudyRecords(): Promise<StudyRecord[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.STUDY_RECORDS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get study records error:', error);
      return [];
    }
  }

  async getStudyRecordsByDate(date: string): Promise<StudyRecord[]> {
    const records = await this.getStudyRecords();
    return records.filter(record => record.study_date === date);
  }

  // 学习计划操作
  async addStudyPlan(plan: Omit<StudyPlan, 'id'>): Promise<void> {
    const plans = await this.getStudyPlans();
    const newId = plans.length > 0 ? Math.max(...plans.map(p => p.id!)) + 1 : 1;

    const newPlan: StudyPlan = {
      ...plan,
      id: newId
    };

    plans.push(newPlan);
    await AsyncStorage.setItem(this.KEYS.STUDY_PLANS, JSON.stringify(plans));
  }

  async getStudyPlans(): Promise<StudyPlan[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.STUDY_PLANS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get study plans error:', error);
      return [];
    }
  }

  async getTodayStudyPlan(): Promise<StudyPlan[]> {
    const today = new Date().toISOString().split('T')[0];
    const plans = await this.getStudyPlans();
    return plans.filter(plan =>
      plan.plan_date === today && !plan.completed
    );
  }

  async completeStudyPlan(planId: number): Promise<void> {
    const plans = await this.getStudyPlans();
    const index = plans.findIndex(plan => plan.id === planId);

    if (index !== -1) {
      plans[index].completed = true;
      await AsyncStorage.setItem(this.KEYS.STUDY_PLANS, JSON.stringify(plans));
    }
  }

  // 文章操作
  async getArticles(): Promise<Article[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.ARTICLES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get articles error:', error);
      return [];
    }
  }

  async getArticleById(id: number): Promise<Article | null> {
    const articles = await this.getArticles();
    return articles.find(article => article.id === id) || null;
  }

  async saveArticle(article: Omit<Article, 'id'>): Promise<number> {
    const articles = await this.getArticles();
    const newId = articles.length > 0 ? Math.max(...articles.map(a => a.id!)) + 1 : 1;

    const newArticle: Article = {
      ...article,
      id: newId,
      created_at: new Date().toISOString(),
      read_count: 0
    };

    articles.push(newArticle);
    await AsyncStorage.setItem(this.KEYS.ARTICLES, JSON.stringify(articles));
    return newId;
  }

  async updateArticle(id: number, updates: Partial<Article>): Promise<void> {
    const articles = await this.getArticles();
    const index = articles.findIndex(article => article.id === id);

    if (index !== -1) {
      articles[index] = { ...articles[index], ...updates };
      await AsyncStorage.setItem(this.KEYS.ARTICLES, JSON.stringify(articles));
    }
  }

  async deleteArticle(id: number): Promise<void> {
    const articles = await this.getArticles();
    const filtered = articles.filter(article => article.id !== id);
    await AsyncStorage.setItem(this.KEYS.ARTICLES, JSON.stringify(filtered));
  }

  // 考题练习记录操作
  async saveExamSession(session: Omit<ExamSession, 'id'>): Promise<number> {
    const sessions = await this.getExamSessions();
    const newId = sessions.length > 0 ? Math.max(...sessions.map(s => s.id!)) + 1 : 1;
    const newSession: ExamSession = { ...session, id: newId };
    sessions.push(newSession);
    await AsyncStorage.setItem(this.KEYS.EXAM_SESSIONS, JSON.stringify(sessions));
    return newId;
  }

  async getExamSessions(): Promise<ExamSession[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.EXAM_SESSIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get exam sessions error:', error);
      return [];
    }
  }

  async deleteExamSession(id: number): Promise<void> {
    const sessions = await this.getExamSessions();
    const filtered = sessions.filter(s => s.id !== id);
    await AsyncStorage.setItem(this.KEYS.EXAM_SESSIONS, JSON.stringify(filtered));
  }

  async updateExamSession(id: number, session: Omit<ExamSession, 'id'>): Promise<void> {
    const sessions = await this.getExamSessions();
    const index = sessions.findIndex(s => s.id === id);
    if (index !== -1) {
      sessions[index] = { ...session, id };
      await AsyncStorage.setItem(this.KEYS.EXAM_SESSIONS, JSON.stringify(sessions));
    }
  }

  // 错题本操作
  async getWrongQuestions(): Promise<WrongQuestion[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.WRONG_QUESTIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get wrong questions error:', error);
      return [];
    }
  }

  async addOrUpdateWrongQuestion(
    question: ExamSession['questions'][0],
    wrongAnswer: string,
    isCorrectNow: boolean
  ): Promise<void> {
    const wrongQuestions = await this.getWrongQuestions();
    const wordId = question.word_id;
    const qType = question.type;

    // 去重：同一 word_id + type 视为同一道题
    const existing = wrongQuestions.find(
      q => q.question.word_id === wordId && q.question.type === qType
    );

    if (existing) {
      if (isCorrectNow) {
        existing.correct_count += 1;
      } else {
        existing.wrong_count += 1;
        existing.wrong_answer = wrongAnswer;
      }
      existing.last_attempt_at = new Date().toISOString();
    } else {
      const newQ: WrongQuestion = {
        id: wrongQuestions.length > 0
          ? Math.max(...wrongQuestions.map(q => q.id!)) + 1
          : 1,
        question,
        wrong_answer: wrongAnswer,
        correct_count: isCorrectNow ? 1 : 0,
        wrong_count: isCorrectNow ? 0 : 1,
        last_attempt_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      wrongQuestions.push(newQ);
    }

    await AsyncStorage.setItem(this.KEYS.WRONG_QUESTIONS, JSON.stringify(wrongQuestions));
  }

  async updateWrongQuestion(id: number, updates: Partial<WrongQuestion>): Promise<void> {
    const questions = await this.getWrongQuestions();
    const index = questions.findIndex(q => q.id === id);
    if (index !== -1) {
      questions[index] = { ...questions[index], ...updates };
      await AsyncStorage.setItem(this.KEYS.WRONG_QUESTIONS, JSON.stringify(questions));
    }
  }

  async removeWrongQuestion(id: number): Promise<void> {
    const questions = await this.getWrongQuestions();
    const filtered = questions.filter(q => q.id !== id);
    await AsyncStorage.setItem(this.KEYS.WRONG_QUESTIONS, JSON.stringify(filtered));
  }

  // 真题练习记录操作
  async saveRealExamSession(session: RealExamSession): Promise<void> {
    const sessions = await this.getRealExamSessions();
    sessions.push(session);
    await AsyncStorage.setItem(this.KEYS.REAL_EXAM_SESSIONS, JSON.stringify(sessions));
  }

  async getRealExamSessions(): Promise<RealExamSession[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.REAL_EXAM_SESSIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get real exam sessions error:', error);
      return [];
    }
  }

  // ==================== 真题错题本操作 ====================
  // 与单词错题本 (WrongQuestion) 独立存储：真题以 questionId 为主键，模型形状不同。
  async getRealExamWrongQuestions(): Promise<RealExamWrongQuestion[]> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.REAL_EXAM_WRONG_QUESTIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get real exam wrong questions error:', error);
      return [];
    }
  }

  /**
   * 根据一次真题会话批量 upsert 错题本：
   * - 错的题：已存在则 wrong_count++ 并刷新 userAnswer；否则新建。
   * - 对的题：已存在则 correct_count++；达到 mastery 阈值时移除该条。
   * - 对且不在错题本里的题：不做处理（避免把从未做错的题也塞进错题本）。
   */
  async addOrUpdateRealExamWrongQuestions(
    session: RealExamSession,
    paper: RealExamReadingPassage | RealExamClozePaper | RealExamNewTypePaper | undefined,
    setId: 'english1' | 'english2',
  ): Promise<void> {
    if (!paper) return;
    const list = await this.getRealExamWrongQuestions();
    const now = new Date().toISOString();

    // 构建 questionId -> 快照元数据的映射，便于新增时填题面/选项
    const snapshots = new Map<string, Omit<RealExamWrongQuestion,
      'userAnswer' | 'wrong_count' | 'correct_count' | 'last_attempt_at' | 'created_at'>>();

    if (session.mode === 'reading') {
      const passage = paper as RealExamReadingPassage;
      for (const q of passage.questions) {
        snapshots.set(q.id, {
          questionId: q.id,
          year: session.year,
          setId,
          mode: 'reading',
          paperId: passage.id,
          paperTitle: passage.title,
          stem: q.stem,
          options: q.options,
          correctAnswer: q.answer,
          explanation: q.explanation,
        });
      }
    } else if (session.mode === 'newtype') {
      const ntPaper = paper as RealExamNewTypePaper;
      // 选项池转成带字母前缀的字符串，供错题本回顾展示
      const optionStrings = ntPaper.options.map(o => `${o.letter}) ${o.text}`);
      for (const q of ntPaper.questions) {
        const qid = `${ntPaper.id}-p${q.index}`;
        snapshots.set(qid, {
          questionId: qid,
          year: session.year,
          setId,
          mode: 'newtype',
          paperId: ntPaper.id,
          blankIndex: q.index,
          options: optionStrings,
          correctAnswer: q.answer,
          explanation: q.explanation,
        });
      }
    } else {
      const clozePaper = paper as RealExamClozePaper;
      for (const b of clozePaper.blanks) {
        const qid = `${clozePaper.id}-b${b.index}`;
        snapshots.set(qid, {
          questionId: qid,
          year: session.year,
          setId,
          mode: 'cloze',
          paperId: clozePaper.id,
          blankIndex: b.index,
          options: b.options,
          correctAnswer: b.answer,
          explanation: b.explanation,
        });
      }
    }

    for (const ans of session.answers) {
      const existingIdx = list.findIndex(w => w.questionId === ans.questionId);
      if (ans.correct) {
        if (existingIdx === -1) continue;                       // 从没错过，不入本
        list[existingIdx].correct_count += 1;
        list[existingIdx].last_attempt_at = now;
        if (list[existingIdx].correct_count >= WRONG_QUESTION_MASTERY_THRESHOLD) {
          list.splice(existingIdx, 1);                          // 掌握后移除
        }
      } else {
        const snap = snapshots.get(ans.questionId);
        if (!snap) continue;                                    // 找不到题面则跳过
        if (existingIdx !== -1) {
          list[existingIdx].wrong_count += 1;
          list[existingIdx].userAnswer = ans.selected;
          list[existingIdx].last_attempt_at = now;
        } else {
          list.push({
            ...snap,
            userAnswer: ans.selected,
            wrong_count: 1,
            correct_count: 0,
            last_attempt_at: now,
            created_at: now,
          });
        }
      }
    }

    await AsyncStorage.setItem(this.KEYS.REAL_EXAM_WRONG_QUESTIONS, JSON.stringify(list));
  }

  async removeRealExamWrongQuestion(questionId: string): Promise<void> {
    const list = await this.getRealExamWrongQuestions();
    const filtered = list.filter(w => w.questionId !== questionId);
    await AsyncStorage.setItem(this.KEYS.REAL_EXAM_WRONG_QUESTIONS, JSON.stringify(filtered));
  }

  /** 更新真题错题的解析（AI 生成后回写，下次无需重新生成）。 */
  async updateRealExamWrongExplanation(questionId: string, explanation: string): Promise<void> {
    const list = await this.getRealExamWrongQuestions();
    const idx = list.findIndex(w => w.questionId === questionId);
    if (idx !== -1) {
      list[idx].explanation = explanation;
      await AsyncStorage.setItem(this.KEYS.REAL_EXAM_WRONG_QUESTIONS, JSON.stringify(list));
    }
  }

  // ==================== 真题答题草稿（中途暂存，重进可恢复）====================
  // 以 paperId 为键存 selections（Record<string, RealExamOptionLetter>）。阅读用 questionId、
  // 完形用 blank index、新题型用位号的字符串形式作内部 key；提交后清除。
  async getRealExamDraft(paperId: string): Promise<Record<string, RealExamOptionLetter>> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.REAL_EXAM_DRAFTS);
      const all: Record<string, Record<string, RealExamOptionLetter>> = data ? JSON.parse(data) : {};
      return all[paperId] ?? {};
    } catch (error) {
      console.error('Get real exam draft error:', error);
      return {};
    }
  }

  async saveRealExamDraft(paperId: string, selections: Record<string, RealExamOptionLetter>): Promise<void> {
    const data = await AsyncStorage.getItem(this.KEYS.REAL_EXAM_DRAFTS);
    const all: Record<string, Record<string, RealExamOptionLetter>> = data ? JSON.parse(data) : {};
    all[paperId] = selections;
    await AsyncStorage.setItem(this.KEYS.REAL_EXAM_DRAFTS, JSON.stringify(all));
  }

  async clearRealExamDraft(paperId: string): Promise<void> {
    const data = await AsyncStorage.getItem(this.KEYS.REAL_EXAM_DRAFTS);
    const all: Record<string, Record<string, RealExamOptionLetter>> = data ? JSON.parse(data) : {};
    delete all[paperId];
    await AsyncStorage.setItem(this.KEYS.REAL_EXAM_DRAFTS, JSON.stringify(all));
  }

  /** 导出备份用：返回全部草稿数据（raw Record<string, Record<string, RealExamOptionLetter>>）。 */
  async getAllRealExamDrafts(): Promise<Record<string, Record<string, RealExamOptionLetter>>> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.REAL_EXAM_DRAFTS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Get all real exam drafts error:', error);
      return {};
    }
  }

  async getWordArticleCoverage(): Promise<Map<number, number>> {
    const articles = await this.getArticles();
    const coverage = new Map<number, number>();

    for (const article of articles) {
      for (const wordId of article.word_ids) {
        coverage.set(wordId, (coverage.get(wordId) || 0) + 1);
      }
    }

    return coverage;
  }

  private normalizeSettings(settings: Partial<AppSettings> & { [key: string]: any } = {}): AppSettings {
    const provider = (settings.aiProvider && settings.aiProvider in AI_PROVIDERS)
      ? settings.aiProvider as AIProviderId
      : DEFAULT_SETTINGS.aiProvider;
    const defaultModel = AI_PROVIDERS[provider].defaultModel;

    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      aiProvider: provider,
      aiModel: settings.aiModel || defaultModel,
      apiKey: settings.apiKey || '',
    };
  }

  // 设置操作
  async getSettings(): Promise<AppSettings> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.SETTINGS);
      const parsed = data ? JSON.parse(data) : {};
      return this.normalizeSettings(parsed);
    } catch (error) {
      console.error('Get settings error:', error);
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    const current = await this.getSettings();
    const next = this.normalizeSettings({ ...current, ...settings });
    await AsyncStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(next));
  }

  // 数据导入导出
  async exportData(): Promise<string> {
    const settings = await this.getSettings();
    const data = {
      appName: 'memo-grad',
      schemaVersion: 1,
      words: await this.getWords(),
      studyRecords: await this.getStudyRecords(),
      studyPlans: await this.getStudyPlans(),
      articles: await this.getArticles(),
      examSessions: await this.getExamSessions(),
      wrongQuestions: await this.getWrongQuestions(),
      ignoredWordbankWords: await this.getIgnoredWordbankWords(),
      realExamSessions: await this.getRealExamSessions(),
      realExamWrongQuestions: await this.getRealExamWrongQuestions(),
      realExamDrafts: await this.getAllRealExamDrafts(),
      settings: {
        ...settings,
        apiKey: '',
        apiKeyConfigured: Boolean(settings.apiKey)
      },
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      if (data.words) {
        await AsyncStorage.setItem(this.KEYS.WORDS, JSON.stringify(data.words));
      }
      if (data.studyRecords) {
        await AsyncStorage.setItem(this.KEYS.STUDY_RECORDS, JSON.stringify(data.studyRecords));
      }
      if (data.studyPlans) {
        await AsyncStorage.setItem(this.KEYS.STUDY_PLANS, JSON.stringify(data.studyPlans));
      }
      if (data.articles) {
        await AsyncStorage.setItem(this.KEYS.ARTICLES, JSON.stringify(data.articles));
      }
      if (data.settings) {
        const currentSettings = await this.getSettings();
        await this.saveSettings({
          ...data.settings,
          apiKey: data.settings.apiKey || currentSettings.apiKey
        });
      }
      if (data.examSessions) {
        await AsyncStorage.setItem(this.KEYS.EXAM_SESSIONS, JSON.stringify(data.examSessions));
      }
      if (data.wrongQuestions) {
        await AsyncStorage.setItem(this.KEYS.WRONG_QUESTIONS, JSON.stringify(data.wrongQuestions));
      }
      if (data.ignoredWordbankWords) {
        await AsyncStorage.setItem(
          this.KEYS.IGNORED_WORDBANK_WORDS,
          JSON.stringify(data.ignoredWordbankWords)
        );
      }
      if (data.realExamSessions) {
        await AsyncStorage.setItem(
          this.KEYS.REAL_EXAM_SESSIONS,
          JSON.stringify(data.realExamSessions)
        );
      }
      if (data.realExamWrongQuestions) {
        await AsyncStorage.setItem(
          this.KEYS.REAL_EXAM_WRONG_QUESTIONS,
          JSON.stringify(data.realExamWrongQuestions)
        );
      }
      if (data.realExamDrafts) {
        await AsyncStorage.setItem(
          this.KEYS.REAL_EXAM_DRAFTS,
          JSON.stringify(data.realExamDrafts)
        );
      }
    } catch (error) {
      console.error('Import data error:', error);
      throw new Error('数据导入失败');
    }
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([
      this.KEYS.WORDS,
      this.KEYS.STUDY_RECORDS,
      this.KEYS.STUDY_PLANS,
      this.KEYS.ARTICLES,
      this.KEYS.EXAM_SESSIONS,
      this.KEYS.WRONG_QUESTIONS,
      this.KEYS.IGNORED_WORDBANK_WORDS,
      this.KEYS.REAL_EXAM_SESSIONS,
      this.KEYS.REAL_EXAM_WRONG_QUESTIONS,
      this.KEYS.REAL_EXAM_DRAFTS,
      this.KEYS.SETTINGS
    ]);
  }
}

export default StorageService.getInstance();