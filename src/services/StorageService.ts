import { Word, StudyRecord, StudyPlan, Article, ExamSession, ExamDraft, WrongQuestion, AppSettings, AIProviderId, RealExamSession, RealExamWrongQuestion, RealExamReadingPassage, RealExamClozePaper, RealExamNewTypePaper, RealExamLetter, RealExamOptionLetter } from '../types';
import { AI_PROVIDERS, WRONG_QUESTION_MASTERY_THRESHOLD } from '../constants';
import { generateId, nowIso, excludeDeleted } from '../utils/idUtils';
import { migrateToUuidSchema, MigrationResult, CURRENT_SCHEMA_VERSION } from './migrations';

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
  apiKey: '',
  aiProvider: 'deepseek',
  aiModel: AI_PROVIDERS.deepseek.defaultModel,
  articleWordCount: 10,
  articleLength: 200,
  examQuestionCount: 10,
  examAutoAdvance: true,
  autoAddNewWords: true,
};

class StorageService {
  private static instance: StorageService;

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // 当前登录用户的 ID。未登录时为 null，此时不加分隔符（与离线未登录场景兼容）。
  private currentUserId: string | null = null;

  /** 登录成功后调用，切换当前用户上下文。切换后所有 key 自动带上新用户前缀。 */
  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  /** 取当前用户的数据 key（自动带前缀）。 */
  key(name: string): string {
    const prefix = this.currentUserId ? `${this.currentUserId}:` : '';
    return `${prefix}${name}`;
  }

  /** 获取所有同步实体的当前用户存储 key。供 SyncService 使用。 */
  syncEntityKeys(): Record<string, string> {
    return {
      word: this.key(this.KEYS.WORDS),
      studyRecord: this.key(this.KEYS.STUDY_RECORDS),
      studyPlan: this.key(this.KEYS.STUDY_PLANS),
      article: this.key(this.KEYS.ARTICLES),
      examSession: this.key(this.KEYS.EXAM_SESSIONS),
      wrongQuestion: this.key(this.KEYS.WRONG_QUESTIONS),
      realExamSession: this.key(this.KEYS.REAL_EXAM_SESSIONS),
      realExamWrongQuestion: this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS),
    };
  }

  /** 获取 lastSyncAt 的当前用户存储 key。 */
  lastSyncKey(): string {
    return this.key(this.KEYS.LAST_SYNC_AT);
  }

  /** 持久化未捕获异常记录（App.tsx 全局兜底调用，尽力而为，不抛错）。 */
  async persistFatalError(record: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(this.key(this.KEYS.LAST_FATAL_ERROR), JSON.stringify(record));
    } catch {
      // 记录失败不影响兜底展示
    }
  }

  /** 读取并清除上次未捕获异常记录（读一次即删，避免每次启动都弹旧错误）。 */
  async takeFatalError(): Promise<{ message: string; stack?: string; at: string } | null> {
    try {
      const raw = await AsyncStorage.getItem(this.key(this.KEYS.LAST_FATAL_ERROR));
      if (!raw) {
        return null;
      }
      await AsyncStorage.removeItem(this.key(this.KEYS.LAST_FATAL_ERROR));
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * 清除当前用户所有同步相关数据（不含 token/settings）。
   * 用于登录切换或重置缓存场景，确保下个用户拿到干净的本地环境。
   */
  async clearCurrentUserSyncData(): Promise<void> {
    await AsyncStorage.multiRemove([
      this.key(this.KEYS.WORDS),
      this.key(this.KEYS.STUDY_RECORDS),
      this.key(this.KEYS.STUDY_PLANS),
      this.key(this.KEYS.ARTICLES),
      this.key(this.KEYS.EXAM_SESSIONS),
      this.key(this.KEYS.WRONG_QUESTIONS),
      this.key(this.KEYS.REAL_EXAM_SESSIONS),
      this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS),
      this.key(this.KEYS.LAST_SYNC_AT),
    ]);
  }

  // 存储键名（原始名称，不带前缀；实际使用时通过 key() 动态拼接）
  private readonly KEYS = {
    WORDS: 'kaoyan_words',
    STUDY_RECORDS: 'kaoyan_study_records',
    STUDY_PLANS: 'kaoyan_study_plans',
    SETTINGS: 'kaoyan_settings',
    ARTICLES: 'kaoyan_articles',
    EXAM_SESSIONS: 'kaoyan_exam_sessions',
    WRONG_QUESTIONS: 'kaoyan_wrong_questions',
    IGNORED_WORDBANK_WORDS: 'kaoyan_ignored_wordbank_words',
    AUTO_FILL_LAST_DATE: 'kaoyan_auto_fill_last_date',
    REAL_EXAM_SESSIONS: 'kaoyan_real_exam_sessions',
    REAL_EXAM_WRONG_QUESTIONS: 'kaoyan_real_exam_wrong_questions',
    REAL_EXAM_DRAFTS: 'kaoyan_real_exam_drafts',
    EXAM_DRAFT: 'kaoyan_exam_draft',
    SCHEMA_VERSION: 'kaoyan_schema_version',
    MIGRATION_BACKUP: 'kaoyan_migration_backup_v1',
    LAST_SYNC_AT: 'kaoyan_last_sync_at',
    LAST_FATAL_ERROR: 'kaoyan_last_fatal_error',
  };

  /** 迁移只跑一次，用一个共享 Promise 让并发调用方都等同一次执行。 */
  private migrationPromise: Promise<MigrationResult> | null = null;

  /**
   * 确保数据已迁移到 UUID schema。
   *
   * 所有读写入口都先 await 这个方法。看起来啰嗦，但替代方案（只在 App 启动时调一次）
   * 有竞态：screen 的 useEffect 可能在迁移完成前就读到旧格式数据，
   * 于是 UI 拿着数字 ID 去和 UUID 比较，静默显示空列表。
   */
  async ensureMigrated(): Promise<MigrationResult> {
    if (!this.migrationPromise) {
      this.migrationPromise = migrateToUuidSchema(AsyncStorage, (rawKey) => this.key(rawKey)).catch((error) => {
        // 迁移失败不能让整个 app 卡死；原始数据仍在（版本号未推进），下次启动会重试
        console.error('[StorageService] UUID 迁移失败:', error);
        return { migrated: false, reason: 'error' } as MigrationResult;
      });
    }
    return this.migrationPromise;
  }

  // 生词操作
  async addWord(word: Omit<Word, 'id'>): Promise<string> {
    await this.ensureMigrated();
    const words = await this.getAllWordsRaw();

    // 检查是否已存在同名单词（忽略大小写，不计入已软删除的记录）
    const alreadyExists = words.some(
      w => w.word.toLowerCase() === word.word.toLowerCase() && !w.deleted_at
    );

    if (alreadyExists) {
      // 返回现有词的 ID，避免物理重复
      const existing = words.find(
        w => w.word.toLowerCase() === word.word.toLowerCase() && !w.deleted_at
      );
      return existing!.id;
    }

    const newId = generateId();
    const now = nowIso();

    const newWord: Word = {
      ...word,
      id: newId,
      similar_words: Array.isArray(word.similar_words) ? word.similar_words : [],
      created_at: now,
      updated_at: now,
      deleted_at: null,
      dirty: true
    };

    words.push(newWord);
    await AsyncStorage.setItem(this.key(this.KEYS.WORDS), JSON.stringify(words));
    return newId;
  }

  /**
   * 读取包含软删除记录的全量列表，仅供内部写操作使用。
   * 写操作必须基于全量数据回写，否则过滤掉的软删除记录会被物理抹掉，
   * 删除事实就无法同步到其他设备了。
   */
  private async getAllWordsRaw(): Promise<Word[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.WORDS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get words error:', error);
      return [];
    }
  }

  async getWords(): Promise<Word[]> {
    await this.ensureMigrated();
    return excludeDeleted(await this.getAllWordsRaw());
  }

  async getWordById(id: string): Promise<Word | null> {
    const words = await this.getWords();
    return words.find(word => word.id === id) || null;
  }

  async searchWords(query: string): Promise<Word[]> {
    const words = await this.getWords();
    return words.filter(word =>
      word.word.toLowerCase().includes(query.toLowerCase())
    );
  }

  async updateWord(id: string, updates: Partial<Word>): Promise<void> {
    await this.ensureMigrated();
    const words = await this.getAllWordsRaw();
    const index = words.findIndex(word => word.id === id);

    if (index !== -1) {
      words[index] = {
        ...words[index],
        ...updates,
        updated_at: nowIso(),
        dirty: true
      };
      await AsyncStorage.setItem(this.key(this.KEYS.WORDS), JSON.stringify(words));
    }
  }

  /** 软删除：写 deleted_at 而非移除元素，让删除动作可以同步到其他设备。 */
  async deleteWord(id: string): Promise<void> {
    await this.ensureMigrated();
    const words = await this.getAllWordsRaw();
    const index = words.findIndex(word => word.id === id);
    if (index !== -1) {
      const now = nowIso();
      words[index] = { ...words[index], deleted_at: now, updated_at: now, dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.WORDS), JSON.stringify(words));
    }
  }

  /**
   * 生词本全部词条的小写词形集合，**包含软删除记录**。
   * 自动配词用它做排除——用户删过的词不能次日又被自动加回。
   */
  async getWordbookKeysIncludingDeleted(): Promise<Set<string>> {
    const words = await this.getAllWordsRaw();
    return new Set(words.map(w => w.word.toLowerCase()));
  }

  /** 自动配词的当日幂等守卫：已执行过则返回当天日期，否则 null。 */
  async getAutoFillLastDate(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.key(this.KEYS.AUTO_FILL_LAST_DATE));
    } catch {
      return null;
    }
  }

  async setAutoFillLastDate(date: string): Promise<void> {
    await AsyncStorage.setItem(this.key(this.KEYS.AUTO_FILL_LAST_DATE), date);
  }

  // 词库忽略词操作
  async getIgnoredWordbankWords(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.IGNORED_WORDBANK_WORDS));
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
      this.key(this.KEYS.IGNORED_WORDBANK_WORDS),
      JSON.stringify(Array.from(next))
    );
  }

  async clearIgnoredWordbankWords(): Promise<void> {
    await AsyncStorage.removeItem(this.key(this.KEYS.IGNORED_WORDBANK_WORDS));
  }

  // 学习记录操作
  async addStudyRecord(record: Omit<StudyRecord, 'id'>): Promise<void> {
    await this.ensureMigrated();
    const records = await this.getAllStudyRecordsRaw();

    const newRecord: StudyRecord = {
      ...record,
      id: generateId(),
      updated_at: nowIso(),
      deleted_at: null,
      dirty: true
    };

    records.push(newRecord);
    await AsyncStorage.setItem(this.key(this.KEYS.STUDY_RECORDS), JSON.stringify(records));
  }

  private async getAllStudyRecordsRaw(): Promise<StudyRecord[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.STUDY_RECORDS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get study records error:', error);
      return [];
    }
  }

  async getStudyRecords(): Promise<StudyRecord[]> {
    await this.ensureMigrated();
    return excludeDeleted(await this.getAllStudyRecordsRaw());
  }

  async getStudyRecordsByDate(date: string): Promise<StudyRecord[]> {
    const records = await this.getStudyRecords();
    return records.filter(record => record.study_date === date);
  }

  // 学习计划操作
  async addStudyPlan(plan: Omit<StudyPlan, 'id'>): Promise<void> {
    await this.ensureMigrated();
    const plans = await this.getAllStudyPlansRaw();

    const newPlan: StudyPlan = {
      ...plan,
      id: generateId(),
      updated_at: nowIso(),
      deleted_at: null,
      dirty: true
    };

    plans.push(newPlan);
    await AsyncStorage.setItem(this.key(this.KEYS.STUDY_PLANS), JSON.stringify(plans));
  }

  private async getAllStudyPlansRaw(): Promise<StudyPlan[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.STUDY_PLANS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get study plans error:', error);
      return [];
    }
  }

  async getStudyPlans(): Promise<StudyPlan[]> {
    await this.ensureMigrated();
    return excludeDeleted(await this.getAllStudyPlansRaw());
  }

  async getTodayStudyPlan(): Promise<StudyPlan[]> {
    const today = new Date().toISOString().split('T')[0];
    const plans = await this.getStudyPlans();
    return plans.filter(plan =>
      plan.plan_date === today && !plan.completed
    );
  }

  async completeStudyPlan(planId: string): Promise<void> {
    await this.ensureMigrated();
    const plans = await this.getAllStudyPlansRaw();
    const index = plans.findIndex(plan => plan.id === planId);

    if (index !== -1) {
      plans[index] = { ...plans[index], completed: true, updated_at: nowIso(), dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.STUDY_PLANS), JSON.stringify(plans));
    }
  }

  /**
   * 完成某词当日所有未完成计划。
   * 「太简单」移除词时收尾用：词已软删、学习页捞不到，
   * 若计划还挂着未完成，首页会一直显示有待学（幽灵待学数）。
   */
  async completeTodayPlansForWord(wordId: string): Promise<void> {
    await this.ensureMigrated();
    // 本地日期，与计划创建侧（date-fns format）保持一致
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const plans = await this.getAllStudyPlansRaw();
    let changed = false;
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      if (p.word_id === wordId && p.plan_date === today && !p.completed) {
        plans[i] = { ...p, completed: true, updated_at: nowIso(), dirty: true };
        changed = true;
      }
    }
    if (changed) {
      await AsyncStorage.setItem(this.key(this.KEYS.STUDY_PLANS), JSON.stringify(plans));
    }
  }

  // 文章操作
  private async getAllArticlesRaw(): Promise<Article[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.ARTICLES));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get articles error:', error);
      return [];
    }
  }

  async getArticles(): Promise<Article[]> {
    await this.ensureMigrated();
    return excludeDeleted(await this.getAllArticlesRaw());
  }

  async getArticleById(id: string): Promise<Article | null> {
    const articles = await this.getArticles();
    return articles.find(article => article.id === id) || null;
  }

  async saveArticle(article: Omit<Article, 'id'>): Promise<string> {
    await this.ensureMigrated();
    const articles = await this.getAllArticlesRaw();
    const newId = generateId();
    const now = nowIso();

    const newArticle: Article = {
      ...article,
      id: newId,
      created_at: now,
      read_count: 0,
      updated_at: now,
      deleted_at: null,
      dirty: true
    };

    articles.push(newArticle);
    await AsyncStorage.setItem(this.key(this.KEYS.ARTICLES), JSON.stringify(articles));
    return newId;
  }

  async updateArticle(id: string, updates: Partial<Article>): Promise<void> {
    await this.ensureMigrated();
    const articles = await this.getAllArticlesRaw();
    const index = articles.findIndex(article => article.id === id);

    if (index !== -1) {
      articles[index] = { ...articles[index], ...updates, updated_at: nowIso(), dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.ARTICLES), JSON.stringify(articles));
    }
  }

  async deleteArticle(id: string): Promise<void> {
    await this.ensureMigrated();
    const articles = await this.getAllArticlesRaw();
    const index = articles.findIndex(article => article.id === id);
    if (index !== -1) {
      const now = nowIso();
      articles[index] = { ...articles[index], deleted_at: now, updated_at: now, dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.ARTICLES), JSON.stringify(articles));
    }
  }

  // 考题练习记录操作（一次作答一行；重做/错题复习都插入新行）
  async saveExamSession(
    session: Omit<ExamSession, 'id'> & { origin_id?: string | null; source?: 'generation' | 'wrong_review' }
  ): Promise<string> {
    await this.ensureMigrated();
    const sessions = await this.getAllExamSessionsRaw();
    const newId = generateId();
    const newSession: ExamSession = {
      ...session,
      origin_id: session.origin_id ?? null,
      source: session.source ?? 'generation',
      id: newId,
      updated_at: nowIso(),
      deleted_at: null,
      dirty: true
    };
    sessions.push(newSession);
    await AsyncStorage.setItem(this.key(this.KEYS.EXAM_SESSIONS), JSON.stringify(sessions));
    return newId;
  }

  private async getAllExamSessionsRaw(): Promise<ExamSession[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.EXAM_SESSIONS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get exam sessions error:', error);
      return [];
    }
  }

  async getExamSessions(): Promise<ExamSession[]> {
    await this.ensureMigrated();
    const raw = await this.getAllExamSessionsRaw();
    return excludeDeleted(
      await this.dedupeByIdentity(this.key(this.KEYS.EXAM_SESSIONS), raw, s =>
        JSON.stringify({
          type: s.question_type,
          questions: s.questions,
          answers: s.answers.map(a => [a.question_index, a.selected_answer, a.is_correct]),
        }),
        s => new Date(s.created_at).getTime()
      )
    );
  }

  async deleteExamSession(id: string): Promise<void> {
    await this.ensureMigrated();
    const sessions = await this.getAllExamSessionsRaw();
    const index = sessions.findIndex(s => s.id === id);
    if (index !== -1) {
      const now = nowIso();
      sessions[index] = { ...sessions[index], deleted_at: now, updated_at: now, dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.EXAM_SESSIONS), JSON.stringify(sessions));
    }
  }

  /** 删除整套题：软删除根记录及其全部重做行，随同步传播。 */
  async deleteExamSet(rootId: string): Promise<void> {
    await this.ensureMigrated();
    const sessions = await this.getAllExamSessionsRaw();
    const now = nowIso();
    let changed = false;
    const merged = sessions.map(s => {
      if (s.id === rootId || s.origin_id === rootId) {
        changed = true;
        return { ...s, deleted_at: now, updated_at: now, dirty: true };
      }
      return s;
    });
    if (changed) {
      await AsyncStorage.setItem(this.key(this.KEYS.EXAM_SESSIONS), JSON.stringify(merged));
    }
  }

  /**
   * 自愈：合并"内容完全相同且几乎同时写入"的重复记录（按 storageKey 指定实体表）。
   * 旧版结果屏在 React Navigation 开发模式双挂载时会把同一次作答存两条
   * （见 ExamResultScreen savedRef 注释），脏数据已随同步扩散，这里读取时
   * 顺手把多余副本软删除并标记 dirty，让删除事实传播到其他设备/服务端。
   * 仅活跃记录参与配对：用户已手动删除的记录不作为孪生依据。
   */
  private async dedupeByIdentity<T extends { id: string; deleted_at?: string | null }>(
    storageKey: string,
    raw: T[],
    sigOf: (e: T) => string,
    timeOf: (e: T) => number
  ): Promise<T[]> {
    const DUP_WINDOW_MS = 5000;
    const kept: { id: string; sig: string; time: number }[] = [];
    const removedIds = new Set<string>();
    for (const e of [...raw].sort((a, b) => timeOf(a) - timeOf(b))) {
      if (e.deleted_at) continue;
      const sig = sigOf(e);
      const time = timeOf(e);
      const isTwin = kept.some(k => k.sig === sig && Math.abs(k.time - time) <= DUP_WINDOW_MS);
      if (isTwin) {
        removedIds.add(e.id);
      } else {
        kept.push({ id: e.id, sig, time });
      }
    }
    if (removedIds.size === 0) return raw;

    console.warn(`[Storage] 去重合并 ${removedIds.size} 条重复记录 (${storageKey})`);
    const now = nowIso();
    const merged = raw.map(e =>
      removedIds.has(e.id)
        ? { ...e, deleted_at: now, updated_at: now, dirty: true }
        : e
    );
    await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    return merged.filter(e => !e.deleted_at);
  }

  // ==================== AI 出题答题草稿（中途暂存，重进可恢复）====================
  // 单份存储（AI 同时只会有一个进行中练习）。存整套题 + 已答答案 + 当前题号；
  // 答完进结果页落 ExamSession 后由 ExamResultScreen 清除。不进 sync、不带 dirty。
  async getExamDraft(): Promise<ExamDraft | null> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.EXAM_DRAFT));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Get exam draft error:', error);
      return null;
    }
  }

  async saveExamDraft(draft: ExamDraft): Promise<void> {
    await AsyncStorage.setItem(this.key(this.KEYS.EXAM_DRAFT), JSON.stringify(draft));
  }

  async clearExamDraft(): Promise<void> {
    await AsyncStorage.removeItem(this.key(this.KEYS.EXAM_DRAFT));
  }

  // 错题本操作
  private async getAllWrongQuestionsRaw(): Promise<WrongQuestion[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.WRONG_QUESTIONS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get wrong questions error:', error);
      return [];
    }
  }

  async getWrongQuestions(): Promise<WrongQuestion[]> {
    await this.ensureMigrated();
    return excludeDeleted(await this.getAllWrongQuestionsRaw());
  }

  async addOrUpdateWrongQuestion(
    question: ExamSession['questions'][0],
    wrongAnswer: string,
    isCorrectNow: boolean
  ): Promise<void> {
    await this.ensureMigrated();
    const wrongQuestions = await this.getAllWrongQuestionsRaw();
    const wordId = question.word_id;
    const qType = question.type;
    const now = nowIso();

    // 去重：同一 word_id + type 视为同一道题。只在未软删除的条目里找，
    // 否则会复活一条已删除的记录。
    const existing = wrongQuestions.find(
      q => q.question.word_id === wordId && q.question.type === qType && !q.deleted_at
    );

    if (existing) {
      if (isCorrectNow) {
        existing.correct_count += 1;
      } else {
        existing.wrong_count += 1;
        existing.wrong_answer = wrongAnswer;
      }
      existing.last_attempt_at = now;
      existing.updated_at = now;
      existing.dirty = true;
    } else {
      const newQ: WrongQuestion = {
        id: generateId(),
        question,
        wrong_answer: wrongAnswer,
        correct_count: isCorrectNow ? 1 : 0,
        wrong_count: isCorrectNow ? 0 : 1,
        last_attempt_at: now,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        dirty: true,
      };
      wrongQuestions.push(newQ);
    }

    await AsyncStorage.setItem(this.key(this.KEYS.WRONG_QUESTIONS), JSON.stringify(wrongQuestions));
  }

  async updateWrongQuestion(id: string, updates: Partial<WrongQuestion>): Promise<void> {
    await this.ensureMigrated();
    const questions = await this.getAllWrongQuestionsRaw();
    const index = questions.findIndex(q => q.id === id);
    if (index !== -1) {
      questions[index] = { ...questions[index], ...updates, updated_at: nowIso(), dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.WRONG_QUESTIONS), JSON.stringify(questions));
    }
  }

  async removeWrongQuestion(id: string): Promise<void> {
    await this.ensureMigrated();
    const questions = await this.getAllWrongQuestionsRaw();
    const index = questions.findIndex(q => q.id === id);
    if (index !== -1) {
      const now = nowIso();
      questions[index] = { ...questions[index], deleted_at: now, updated_at: now, dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.WRONG_QUESTIONS), JSON.stringify(questions));
    }
  }

  // 真题练习记录操作
  async saveRealExamSession(session: RealExamSession): Promise<void> {
    await this.ensureMigrated();
    const sessions = await this.getAllRealExamSessionsRaw();
    sessions.push({ ...session, updated_at: nowIso(), deleted_at: null, dirty: true });
    await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_SESSIONS), JSON.stringify(sessions));
  }

  private async getAllRealExamSessionsRaw(): Promise<RealExamSession[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.REAL_EXAM_SESSIONS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get real exam sessions error:', error);
      return [];
    }
  }

  async getRealExamSessions(): Promise<RealExamSession[]> {
    await this.ensureMigrated();
    const raw = await this.getAllRealExamSessionsRaw();
    return excludeDeleted(
      await this.dedupeByIdentity(this.key(this.KEYS.REAL_EXAM_SESSIONS), raw, s =>
        JSON.stringify({
          paperId: s.paperId,
          mode: s.mode,
          score: s.score,
          total: s.total,
          answers: s.answers.map(a => [a.questionId, a.selected, a.correct]),
        }),
        s => new Date(s.createdAt).getTime()
      )
    );
  }

  async deleteRealExamSession(id: string): Promise<void> {
    await this.ensureMigrated();
    const sessions = await this.getAllRealExamSessionsRaw();
    const index = sessions.findIndex(s => s.id === id);
    if (index !== -1) {
      const now = nowIso();
      sessions[index] = { ...sessions[index], deleted_at: now, updated_at: now, dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_SESSIONS), JSON.stringify(sessions));
    }
  }

  // ==================== 真题错题本操作 ====================
  // 与单词错题本 (WrongQuestion) 独立存储：真题以 questionId 为主键，模型形状不同。
  private async getAllRealExamWrongQuestionsRaw(): Promise<RealExamWrongQuestion[]> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS));
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Get real exam wrong questions error:', error);
      return [];
    }
  }

  async getRealExamWrongQuestions(): Promise<RealExamWrongQuestion[]> {
    await this.ensureMigrated();
    return excludeDeleted(await this.getAllRealExamWrongQuestionsRaw());
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
    await this.ensureMigrated();
    // 用 raw 列表：写回时必须保留软删除条目，否则删除事实无法同步
    const list = await this.getAllRealExamWrongQuestionsRaw();
    const now = nowIso();

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
      // 只在未软删除的条目里查找，避免复活已删除的错题
      const existingIdx = list.findIndex(w => w.questionId === ans.questionId && !w.deleted_at);
      if (ans.correct) {
        if (existingIdx === -1) continue;                       // 从没错过，不入本
        list[existingIdx].correct_count += 1;
        list[existingIdx].last_attempt_at = now;
        list[existingIdx].updated_at = now;
        list[existingIdx].dirty = true;
        if (list[existingIdx].correct_count >= WRONG_QUESTION_MASTERY_THRESHOLD) {
          // 掌握后软删除（原先是 splice 物理移除，同步场景下会导致该条在其他设备复活）
          list[existingIdx].deleted_at = now;
        }
      } else {
        const snap = snapshots.get(ans.questionId);
        if (!snap) continue;                                    // 找不到题面则跳过
        if (existingIdx !== -1) {
          list[existingIdx].wrong_count += 1;
          list[existingIdx].userAnswer = ans.selected;
          list[existingIdx].last_attempt_at = now;
          list[existingIdx].updated_at = now;
          list[existingIdx].dirty = true;
        } else {
          list.push({
            ...snap,
            userAnswer: ans.selected,
            wrong_count: 1,
            correct_count: 0,
            last_attempt_at: now,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            dirty: true,
          });
        }
      }
    }

    await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS), JSON.stringify(list));
  }

  async removeRealExamWrongQuestion(questionId: string): Promise<void> {
    await this.ensureMigrated();
    const list = await this.getAllRealExamWrongQuestionsRaw();
    const idx = list.findIndex(w => w.questionId === questionId);
    if (idx !== -1) {
      const now = nowIso();
      list[idx] = { ...list[idx], deleted_at: now, updated_at: now, dirty: true };
      await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS), JSON.stringify(list));
    }
  }

  /** 更新真题错题的解析（AI 生成后回写，下次无需重新生成）。 */
  async updateRealExamWrongExplanation(questionId: string, explanation: string): Promise<void> {
    await this.ensureMigrated();
    const list = await this.getAllRealExamWrongQuestionsRaw();
    const idx = list.findIndex(w => w.questionId === questionId);
    if (idx !== -1) {
      list[idx].explanation = explanation;
      list[idx].updated_at = nowIso();
      list[idx].dirty = true;
      await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS), JSON.stringify(list));
    }
  }

  // ==================== 真题答题草稿（中途暂存，重进可恢复）====================
  // 以 paperId 为键存 selections（Record<string, RealExamOptionLetter>）。阅读用 questionId、
  // 完形用 blank index、新题型用位号的字符串形式作内部 key；提交后清除。
  async getRealExamDraft(paperId: string): Promise<Record<string, RealExamOptionLetter>> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.REAL_EXAM_DRAFTS));
      const all: Record<string, Record<string, RealExamOptionLetter>> = data ? JSON.parse(data) : {};
      return all[paperId] ?? {};
    } catch (error) {
      console.error('Get real exam draft error:', error);
      return {};
    }
  }

  async saveRealExamDraft(paperId: string, selections: Record<string, RealExamOptionLetter>): Promise<void> {
    const data = await AsyncStorage.getItem(this.key(this.KEYS.REAL_EXAM_DRAFTS));
    const all: Record<string, Record<string, RealExamOptionLetter>> = data ? JSON.parse(data) : {};
    all[paperId] = selections;
    await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_DRAFTS), JSON.stringify(all));
  }

  async clearRealExamDraft(paperId: string): Promise<void> {
    const data = await AsyncStorage.getItem(this.key(this.KEYS.REAL_EXAM_DRAFTS));
    const all: Record<string, Record<string, RealExamOptionLetter>> = data ? JSON.parse(data) : {};
    delete all[paperId];
    await AsyncStorage.setItem(this.key(this.KEYS.REAL_EXAM_DRAFTS), JSON.stringify(all));
  }

  /** 导出备份用：返回全部草稿数据（raw Record<string, Record<string, RealExamOptionLetter>>）。 */
  async getAllRealExamDrafts(): Promise<Record<string, Record<string, RealExamOptionLetter>>> {
    try {
      const data = await AsyncStorage.getItem(this.key(this.KEYS.REAL_EXAM_DRAFTS));
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Get all real exam drafts error:', error);
      return {};
    }
  }

  async getWordArticleCoverage(): Promise<Map<string, number>> {
    const articles = await this.getArticles();
    const coverage = new Map<string, number>();

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
      const data = await AsyncStorage.getItem(this.key(this.KEYS.SETTINGS));
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
    await AsyncStorage.setItem(this.key(this.KEYS.SETTINGS), JSON.stringify(next));
  }

  // 数据导入导出
  async exportData(): Promise<string> {
    const settings = await this.getSettings();
    const data = {
      appName: 'memo-grad',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      word: await this.getWords(),
      studyRecord: await this.getStudyRecords(),
      studyPlan: await this.getStudyPlans(),
      article: await this.getArticles(),
      examSession: await this.getExamSessions(),
      wrongQuestion: await this.getWrongQuestions(),
      ignoredWordbankWord: await this.getIgnoredWordbankWords(),
      realExamSession: await this.getRealExamSessions(),
      realExamWrongQuestion: await this.getRealExamWrongQuestions(),
      realExamDraft: await this.getAllRealExamDrafts(),
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

      if (data.word) {
        await AsyncStorage.setItem(this.key(this.KEYS.WORDS), JSON.stringify(data.word));
      }
      if (data.studyRecord) {
        await AsyncStorage.setItem(this.key(this.KEYS.STUDY_RECORDS), JSON.stringify(data.studyRecord));
      }
      if (data.studyPlan) {
        await AsyncStorage.setItem(this.key(this.KEYS.STUDY_PLANS), JSON.stringify(data.studyPlan));
      }
      if (data.article) {
        await AsyncStorage.setItem(this.key(this.KEYS.ARTICLES), JSON.stringify(data.article));
      }
      if (data.settings) {
        const currentSettings = await this.getSettings();
        await this.saveSettings({
          ...data.settings,
          apiKey: data.settings.apiKey || currentSettings.apiKey
        });
      }
      if (data.examSession) {
        await AsyncStorage.setItem(this.key(this.KEYS.EXAM_SESSIONS), JSON.stringify(data.examSession));
      }
      if (data.wrongQuestion) {
        await AsyncStorage.setItem(this.key(this.KEYS.WRONG_QUESTIONS), JSON.stringify(data.wrongQuestion));
      }
      if (data.ignoredWordbankWord) {
        await AsyncStorage.setItem(
          this.key(this.KEYS.IGNORED_WORDBANK_WORDS),
          JSON.stringify(data.ignoredWordbankWord)
        );
      }
      if (data.realExamSession) {
        await AsyncStorage.setItem(
          this.key(this.KEYS.REAL_EXAM_SESSIONS),
          JSON.stringify(data.realExamSession)
        );
      }
      if (data.realExamWrongQuestion) {
        await AsyncStorage.setItem(
          this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS),
          JSON.stringify(data.realExamWrongQuestion)
        );
      }
      if (data.realExamDraft) {
        await AsyncStorage.setItem(
          this.key(this.KEYS.REAL_EXAM_DRAFTS),
          JSON.stringify(data.realExamDraft)
        );
      }

      // 导入的可能是网络版之前导出的旧备份（数字 ID）。此时把 schema 版本回退到
      // 备份自身的版本，并重跑迁移，否则这批数字 ID 会绕过迁移直接落地，
      // 与后续 UUID 数据混在一起导致外键失配。
      const importedVersion = Number(data.schemaVersion) || 1;
      if (importedVersion < CURRENT_SCHEMA_VERSION) {
        await AsyncStorage.setItem(this.key(this.KEYS.SCHEMA_VERSION), String(importedVersion));
        this.migrationPromise = null;   // 清掉缓存，强制重新迁移
        await this.ensureMigrated();
      }
    } catch (error) {
      console.error('Import data error:', error);
      throw new Error('数据导入失败');
    }
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([
      this.key(this.KEYS.WORDS),
      this.key(this.KEYS.STUDY_RECORDS),
      this.key(this.KEYS.STUDY_PLANS),
      this.key(this.KEYS.ARTICLES),
      this.key(this.KEYS.EXAM_SESSIONS),
      this.key(this.KEYS.WRONG_QUESTIONS),
      this.key(this.KEYS.IGNORED_WORDBANK_WORDS),
      this.key(this.KEYS.REAL_EXAM_SESSIONS),
      this.key(this.KEYS.REAL_EXAM_WRONG_QUESTIONS),
      this.key(this.KEYS.REAL_EXAM_DRAFTS),
      this.key(this.KEYS.SETTINGS),
      this.key(this.KEYS.MIGRATION_BACKUP),
      this.key(this.KEYS.AUTO_FILL_LAST_DATE)
    ]);
    // 保留 SCHEMA_VERSION：数据虽清空，本地 schema 仍是最新版，无需再迁移
  }

  // ==================== 原始 AsyncStorage 透传 ====================
  // 仅供 AuthProvider 读写 JWT token。JWT 不参与 sync schema、不经过
  // 迁移、不需要 updated_at —— 它只是客户端与服务器的会话凭据。
  // 不用 StorageService 的 ensureMigrated + excludeDeleted 包装链。

  async _rawGetItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }

  async _rawSetItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(key, value);
  }

  async _rawRemove(key: string): Promise<void> {
    return AsyncStorage.removeItem(key);
  }

  /** 公共静态内容缓存的完整 key（不带 userId 前缀；词库是全局共享的）。 */
  contentKey(name: string): string {
    return `content:${name}`;
  }
}

export default StorageService.getInstance();