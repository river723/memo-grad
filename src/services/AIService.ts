/**
 * AI 服务（网络版 v2）。
 *
 * 不再直连 DeepSeek API，而是通过后端 `/api/ai/:action` 代理。
 * 8 个公开方法签名不变 —— 这是 8 个 screen 调用处的零改动基础。
 *
 * 与 v1 的关键差异：
 * - 不需要 apiKey/constructor：后端统一管理 DeepSeek Key
 * - 不需要 prompt 构建：prompt 已搬到后端
 * - 不需要 JSON 解析：后端返回已解析的 `{ success, data }`
 */

import { api, ApiClientError } from './ApiClient';
import { AIResponse } from '../types';

/** 服务端 402：配额耗尽或未订阅，前端收到后应导航到订阅页 */
export class SubscriptionRequiredError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'SubscriptionRequiredError';
  }
}

class AIService {
  /** 调用后端 AI 代理 */
  private async proxy<T = any>(action: string, params: Record<string, unknown>): Promise<T> {
    try {
      const res = await api.post<{ success: boolean; data: T }>(`/api/ai/${action}`, params);
      return res.data;
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        // 402 是 quota 耗尽 / 未订阅，前端可以据此弹订阅引导
        if (err.statusCode === 402) {
          throw new SubscriptionRequiredError(err.message || '该功能需要订阅。请在设置中查看订阅方案。', err.details);
        }
        throw new Error(err.message || 'AI 服务调用失败');
      }
      throw err;
    }
  }

  async analyzeWord(word: string): Promise<AIResponse> {
    return this.proxy<AIResponse>('analyzeWord', { word });
  }

  async analyzeWords(words: string[]): Promise<Map<string, AIResponse>> {
    const data = await this.proxy<Record<string, AIResponse>>('analyzeWords', { words });
    const map = new Map<string, AIResponse>();
    for (const [key, value] of Object.entries(data)) {
      map.set(key, value);
    }
    return map;
  }

  async generateStudyContent(words: string[], type: 'passage' | 'quiz' | 'writing'): Promise<string> {
    return this.proxy<string>('generateStudyContent', { words, type });
  }

  async generateFunArticle(
    words: string[],
    theme: string = 'random',
    targetLength: number = 200
  ): Promise<{ title: string; content: string; translation: string }> {
    return this.proxy('generateFunArticle', { words, theme, targetLength });
  }

  async generateClozeQuestions(
    words: { word: string; meaning: string }[]
  ): Promise<{
    target_word: string;
    sentence: string;
    options: string[];
    correct_answer: string;
    chinese_hint: string;
  }[]> {
    return this.proxy('generateClozeQuestions', { words });
  }

  async generateDefinitionQuestions(
    words: { word: string; meaning: string }[]
  ): Promise<{
    target_word: string;
    sentence: string;
    options: string[];
    correct_definition: string;
  }[]> {
    return this.proxy('generateDefinitionQuestions', { words });
  }

  async generateRealExamExplanation(params: {
    mode: 'reading' | 'cloze' | 'newtype';
    stem?: string;
    blankIndex?: number;
    options: string[];
    correctAnswer: string;
    userAnswer?: string | null;
  }): Promise<string> {
    return this.proxy<string>('generateRealExamExplanation', params);
  }

  async extractWordsFromText(text: string): Promise<string[]> {
    return this.proxy<string[]>('extractWordsFromText', { text });
  }
}

export default new AIService();
