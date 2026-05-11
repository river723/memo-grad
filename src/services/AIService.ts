import axios from 'axios';
import { Word, AIResponse } from '../types';
import { API_CONFIG } from '../constants';

class AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeWord(word: string): Promise<AIResponse> {
    const prompt = this.buildWordAnalysisPrompt(word);

    try {
      const response = await axios.post(
        `${API_CONFIG.OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的考研英语老师，专门帮助学生分析单词的考研用法。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: API_CONFIG.TIMEOUT
        }
      );

      const content = response.data.choices[0].message.content;
      return this.parseAIResponse(content);
    } catch (error) {
      console.error('AI analysis error:', error);
      throw new Error('AI分析失败，请检查网络连接或API密钥');
    }
  }

  async generateStudyContent(wordIds: number[], type: 'passage' | 'quiz' | 'writing'): Promise<string> {
    const prompt = this.buildContentGenerationPrompt(wordIds, type);

    try {
      const response = await axios.post(
        `${API_CONFIG.OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的考研英语老师，专门生成考研英语练习内容。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.5,
          max_tokens: 1500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: API_CONFIG.TIMEOUT
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('AI content generation error:', error);
      throw new Error('AI内容生成失败，请重试');
    }
  }

  async extractWordsFromText(text: string): Promise<string[]> {
    const prompt = `请从以下考研英语文本中提取出所有重要的生词（考研高频词、易错词、熟词僻义）：\n\n${text}\n\n请只返回单词列表，每行一个单词，不要包含其他内容。`;

    try {
      const response = await axios.post(
        `${API_CONFIG.OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的考研英语老师，专门从文本中提取重要词汇。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: API_CONFIG.TIMEOUT
        }
      );

      const content = response.data.choices[0].message.content;
      return content.split('\n').filter((word: string) => word.trim().length > 0);
    } catch (error) {
      console.error('Word extraction error:', error);
      throw new Error('单词提取失败，请重试');
    }
  }

  private buildWordAnalysisPrompt(word: string): string {
    return `请分析单词 "${word}" 的考研英语用法，提供以下信息：

1. 考研英语二最常考的3-5个释义（按重要性排序，特别标注熟词僻义）
2. 每个释义配一个考研真题风格的例句
3. 1-2个形近词或易混词提醒
4. 简单的词根词缀分析（帮助记忆）

请用以下JSON格式返回：
{
  "definitions": [
    {
      "part_of_speech": "词性",
      "meaning": "释义",
      "example": "例句",
      "is_core": true/false,
      "is_rare_sense": true/false
    }
  ],
  "etymology": "词根词缀分析",
  "similar_words": [
    {
      "word": "相似词",
      "relation": "spelling/meaning/root",
      "description": "区别说明"
    }
  ]
}

要求：
- 只关注考研英语二的考点
- 熟词僻义要特别标注
- 例句要符合考研真题风格
- 形近词要真正容易混淆的`;
  }

  private buildContentGenerationPrompt(wordIds: number[], type: string): string {
    const typePrompt = {
      passage: '生成一段考研英语阅读风格的短文',
      quiz: '生成考研英语选择题',
      writing: '生成考研作文可用的高级句型'
    }[type];

    return `请使用用户已学习的单词，${typePrompt}。

    要求：
    - 难度符合考研英语二水平
    - 句式结构贴近考研真题
    - 如果是选择题，选项要有区分度
    - 如果是作文句型，要实用且高级

    单词ID列表：${wordIds.join(', ')}`;
  }

  private parseAIResponse(content: string): AIResponse {
    try {
      // 尝试解析JSON
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 如果无法解析JSON，返回基本结构
      return {
        definitions: [],
        examples: []
      };
    } catch (error) {
      console.error('Parse AI response error:', error);
      return {
        definitions: [],
        examples: []
      };
    }
  }
}

export default AIService;