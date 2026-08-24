/**
 * AI 服务门面（对外形状自网络版 v2 起保持不变 —— 8 个 screen 调用零改动）。
 *
 * 按构建期开关 src/config/appMode.ts 的 OFFLINE_MODE 分发：
 * - 在线形态：走后端 `/api/ai/:action` 代理，Key 由服务端统一管理；
 *   402（配额耗尽/未订阅）转抛 SubscriptionRequiredError 引导订阅。
 * - 单机形态（OFFLINE_MODE）：走 src/services/ai/localAIEngine.ts 本地引擎，
 *   axios 直连 DeepSeek，Key 来自用户在设置页自配的本地密钥；
 *   无订阅概念，不会抛 SubscriptionRequiredError。
 */

import { OFFLINE_MODE } from '../config/appMode';
import { api, ApiClientError } from './ApiClient';
import { AIResponse } from '../types';
import { LocalAIEngine } from './ai/localAIEngine';

/** 服务端 402：配额耗尽或未订阅，前端收到后应导航到订阅页 */
export class SubscriptionRequiredError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'SubscriptionRequiredError';
  }
}

class AIService {
  /** 单机形态的本地引擎实例；在线形态恒为 null（不参与打包后的执行路径） */
  private local: LocalAIEngine | null = OFFLINE_MODE ? new LocalAIEngine() : null;

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
    return OFFLINE_MODE ? this.local!.analyzeWord(word) : this.proxy<AIResponse>('analyzeWord', { word });
  }

  async analyzeWords(words: string[]): Promise<Map<string, AIResponse>> {
    if (OFFLINE_MODE) return this.local!.analyzeWords(words);
    const data = await this.proxy<Record<string, AIResponse>>('analyzeWords', { words });
    const map = new Map<string, AIResponse>();
    for (const [key, value] of Object.entries(data)) {
      map.set(key, value);
    }
    return map;
  }

  async generateStudyContent(words: string[], type: 'passage' | 'quiz' | 'writing'): Promise<string> {
    return OFFLINE_MODE
      ? this.local!.generateStudyContent(words, type)
      : this.proxy<string>('generateStudyContent', { words, type });
  }

  async generateFunArticle(
    words: string[],
    theme: string = 'random',
    targetLength: number = 200
  ): Promise<{ title: string; content: string; translation: string }> {
    return OFFLINE_MODE
      ? this.local!.generateFunArticle(words, theme, targetLength)
      : this.proxy('generateFunArticle', { words, theme, targetLength });
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
    return OFFLINE_MODE
      ? this.local!.generateClozeQuestions(words)
      : this.proxy('generateClozeQuestions', { words });
  }

  async generateDefinitionQuestions(
    words: { word: string; meaning: string }[]
  ): Promise<{
    target_word: string;
    sentence: string;
    options: string[];
    correct_definition: string;
  }[]> {
    return OFFLINE_MODE
      ? this.local!.generateDefinitionQuestions(words)
      : this.proxy('generateDefinitionQuestions', { words });
  }

  async generateRealExamExplanation(params: {
    mode: 'reading' | 'cloze' | 'newtype';
    stem?: string;
    blankIndex?: number;
    options: string[];
    correctAnswer: string;
    userAnswer?: string | null;
  }): Promise<string> {
    return OFFLINE_MODE
      ? this.local!.generateRealExamExplanation(params)
      : this.proxy<string>('generateRealExamExplanation', params);
  }

  async extractWordsFromText(text: string): Promise<string[]> {
    return OFFLINE_MODE
      ? this.local!.extractWordsFromText(text)
      : this.proxy<string[]>('extractWordsFromText', { text });
  }
}

export default new AIService();
