import { Word, StudyRecord, StudyPlan } from '../types';

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
    SETTINGS: 'kaoyan_settings'
  };

  // 生词操作
  async addWord(word: Omit<Word, 'id'>): Promise<number> {
    const words = await this.getWords();
    const newId = words.length > 0 ? Math.max(...words.map(w => w.id!)) + 1 : 1;

    const newWord: Word = {
      ...word,
      id: newId,
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

  async getWordsByCategory(category: string, limit?: number): Promise<Word[]> {
    const words = await this.getWords();
    const filtered = words.filter(word => word.category === category);

    if (limit) {
      return filtered.slice(0, limit);
    }
    return filtered;
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

  // 设置操作
  async getSettings(): Promise<any> {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.SETTINGS);
      return data ? JSON.parse(data) : {
        dailyNewWords: 10,
        reviewInterval: [1, 2, 4, 7, 15],
        soundEnabled: true,
        theme: 'light',
        apiKey: ''
      };
    } catch (error) {
      console.error('Get settings error:', error);
      return {};
    }
  }

  async saveSettings(settings: any): Promise<void> {
    await AsyncStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  }

  // 数据导入导出
  async exportData(): Promise<string> {
    const data = {
      words: await this.getWords(),
      studyRecords: await this.getStudyRecords(),
      studyPlans: await this.getStudyPlans(),
      settings: await this.getSettings(),
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
      if (data.settings) {
        await AsyncStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(data.settings));
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
      this.KEYS.SETTINGS
    ]);
  }
}

export default StorageService.getInstance();