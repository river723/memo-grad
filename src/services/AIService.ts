import axios from 'axios';
import { AIResponse } from '../types';
import { API_CONFIG } from '../constants';

class AIService {
  private apiKey: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  // 测试网络连接
  async testNetworkConnection(): Promise<boolean> {
    try {
      await axios.get('https://httpbin.org/ip', { timeout: 5000 });
      return true;
    } catch (error: any) {
      console.error('网络连接测试失败:', error.message);
      return false;
    }
  }

  // 测试API密钥
  async testApiKey(): Promise<boolean> {
    try {
      await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      console.log('API密钥测试成功');
      return true;
    } catch (error: any) {
      console.error('API密钥测试失败:', error.message, error.response?.status);
      return false;
    }
  }

  async analyzeWord(word: string): Promise<AIResponse> {
    const prompt = this.buildWordAnalysisPrompt(word);
    console.log('发送AI请求，单词:', word, '使用模型:', API_CONFIG.DEFAULT_MODEL);

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
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

      console.log('AI响应状态:', response.status);
      const content = response.data.choices[0].message.content;
      console.log('AI响应内容:', content.substring(0, 200) + '...');
      const result = this.parseAIResponse(content);
      console.log('解析后的结果:', result);
      return result;
    } catch (error) {
      console.error('AI analysis error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Error details:', error.message, error.response?.status, error.response?.data);
      } else {
        console.error('Error details:', error.message);
      }
      throw new Error('AI分析失败，请检查网络连接或API密钥');
    }
  }

  async analyzeWords(words: string[]): Promise<Map<string, AIResponse>> {
    const results = new Map<string, AIResponse>();
    
    // 批量处理，使用配置的批次大小
    const batchSize = API_CONFIG.BATCH_SIZE;
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);
      const batchPrompt = this.buildBatchAnalysisPrompt(batch);
      console.log(`批量分析单词，使用模型: ${API_CONFIG.DEFAULT_MODEL}, 批次: ${i / batchSize + 1}/${Math.ceil(words.length / batchSize)}`);
      
      try {
        const response = await axios.post(
          `${API_CONFIG.BASE_URL}/chat/completions`,
          {
            model: API_CONFIG.DEFAULT_MODEL,
            messages: [
              {
                role: 'system',
                content: '你是一个专业的考研英语老师，专门帮助学生批量分析单词的考研用法。'
              },
              {
                role: 'user',
                content: batchPrompt
              }
            ],
            temperature: 0.3,
            max_tokens: API_CONFIG.BATCH_MAX_TOKENS
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
        const finishReason = response.data.choices[0].finish_reason;
        if (finishReason === 'length') {
          console.warn(`⚠️ 批次 ${i / batchSize + 1}/${Math.ceil(words.length / batchSize)}: API响应因max_tokens限制被截断(finish_reason=length)，部分单词结果可能不完整`);
        }
        const batchResults = this.parseBatchAIResponse(content);
        
        // 将结果添加到总结果中
        batchResults.forEach((result, word) => {
          results.set(word, result);
        });

        // 检测并补齐本批次中未返回结果的单词（JSON截断或AI未生成导致）
        const missingWords = batch.filter(w => !results.has(w));
        if (missingWords.length > 0) {
          console.warn(`批次中 ${missingWords.length} 个单词缺少AI分析结果，使用默认值:`, missingWords.join(', '));
          missingWords.forEach(word => {
            results.set(word, {
              definitions: [{
                part_of_speech: 'unknown',
                meaning: 'AI分析结果不完整，请手动添加释义',
                example: '',
                is_core: false,
                is_rare_sense: false
              }],
              etymology: '',
              similar_words: [],
              suggestedDifficulty: 3
            });
          });
        }
        
      } catch (error) {
        console.error('Batch AI analysis error:', error);
        // 为失败的单词设置默认结果
        batch.forEach(word => {
          if (!results.has(word)) {
            results.set(word, {
              definitions: [{
                part_of_speech: 'unknown',
                meaning: 'AI分析失败，请手动添加释义',
                example: '',
                is_core: false,
                is_rare_sense: false
              }],
              etymology: '',
              similar_words: []
            });
          }
        });
      }
    }
    
    return results;
  }

  async generateStudyContent(words: string[], type: 'passage' | 'quiz' | 'writing'): Promise<string> {
    const prompt = this.buildContentGenerationPrompt(words, type);

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
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

  async generateFunArticle(
    words: string[],
    theme: string = 'random',
    targetLength: number = 200
  ): Promise<{ title: string; content: string; translation: string }> {
    const themes: Record<string, string> = {
      technology: '科技',
      life: '生活',
      history: '历史',
      nature: '自然',
      science: '科学',
      random: this.getRandomTheme()
    };
    const themeName = themes[theme] || this.getRandomTheme();

    const prompt = `请使用以下单词创作一篇生动有趣的英文短文，并提供中文翻译：

单词列表：${words.join(', ')}
文章主题：${themeName}

要求：
- 文章长度约 ${targetLength} 词
- 每个目标单词自然融入文章，出现 1-2 次
- 文章生动有趣，有完整的叙事结构
- 适合考研英语水平的读者，目标单词以外的词汇要简单易懂
- 标题要吸引人，能概括文章内容
- 翻译要准确流畅，符合中文表达习惯，帮助读者理解原文

请返回严格的JSON格式，不要任何额外文本：
{
  "title": "文章标题",
  "content": "文章正文（英文）",
  "translation": "文章的中文翻译"
}`;

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个英语创意写手兼翻译，擅长将指定的词汇自然融入生动有趣的英文短文中，并准确地翻译成中文，帮助语言学习者通过阅读记忆单词。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4000
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
      console.log('Fun article AI response:', content.substring(0, 200) + '...');

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            title: parsed.title || '未命名文章',
            content: parsed.content || content,
            translation: parsed.translation || ''
          };
        } catch (parseError) {
          console.warn('JSON parse failed for fun article, using raw content');
        }
      }

      // Fallback: use raw content as article body
      return {
        title: '趣味文章',
        content: content,
        translation: ''
      };
    } catch (error) {
      console.error('Fun article generation error:', error);
      throw new Error('文章生成失败，请重试');
    }
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
    const wordList = words.map(w => `- ${w.word}: ${w.meaning}`).join('\n');

    const prompt = `请为以下单词各生成一个完形填空题目。

单词列表（含释义）：
${wordList}

要求：
- 每个句子包含该目标单词，用 [BLANK] 替换目标单词
- 句子长度 15-30 词，难度符合考研英语二水平
- 句子语境清晰，能通过上下文推断出正确答案
- 提供 4 个选项：1 个正确答案 + 3 个干扰项
- 干扰项应与正确答案在词形、词义或搭配上具有迷惑性（但不能是句子中已出现的其他单词）
- 提供一句中文语境提示，帮助理解句子大意

请返回严格的 JSON 格式（只返回 JSON，不要任何额外文本）：
{
  "questions": [
    {
      "target_word": "单词",
      "sentence": "包含 [BLANK] 的完整英文句子",
      "options": ["正确选项", "干扰项1", "干扰项2", "干扰项3"],
      "correct_answer": "正确选项",
      "chinese_hint": "句子中文大意"
    }
  ]
}`;

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的考研英语老师，专门生成完形填空练习题。请严格按照 JSON 格式返回结果。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.5,
          max_tokens: 4000
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
      console.log('Cloze questions AI response:', content.substring(0, 300) + '...');

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.questions && Array.isArray(parsed.questions)) {
            return parsed.questions.map((q: any) => ({
              target_word: q.target_word || '',
              sentence: q.sentence || '',
              options: Array.isArray(q.options) ? q.options : [],
              correct_answer: q.correct_answer || '',
              chinese_hint: q.chinese_hint || '',
            }));
          }
        } catch (parseError) {
          console.warn('JSON parse failed for cloze questions, trying normalize');
          try {
            const fixedJson = this.normalizeJsonString(jsonMatch[0]);
            const parsed = JSON.parse(fixedJson);
            if (parsed.questions && Array.isArray(parsed.questions)) {
              return parsed.questions.map((q: any) => ({
                target_word: q.target_word || '',
                sentence: q.sentence || '',
                options: Array.isArray(q.options) ? q.options : [],
                correct_answer: q.correct_answer || '',
                chinese_hint: q.chinese_hint || '',
              }));
            }
          } catch (fixError) {
            console.error('Fixed JSON parse also failed:', fixError);
          }
        }
      }

      throw new Error('AI 返回格式异常，请重试');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Cloze generation error:', error.message, error.response?.status);
      }
      throw new Error('完形填空题目生成失败，请重试');
    }
  }

  async generateDefinitionQuestions(
    words: { word: string; meaning: string }[]
  ): Promise<{
    target_word: string;
    sentence: string;
    options: string[];
    correct_definition: string;
  }[]> {
    const wordList = words.map(w => `- ${w.word}: ${w.meaning}`).join('\n');

    const prompt = `请为以下单词各生成一个释义单选题。

单词列表（含中文释义）：
${wordList}

要求：
- 为每个单词编写一个自然流畅的英文句子，句子包含该目标单词
- 目标单词在句子中用 *word* 包裹标记（例如 *ubiquitous*）
- 句子长度 15-30 词，难度符合考研英语二水平
- 提供 4 个英文释义选项：1 个正确释义 + 3 个干扰释义
- 正确释义要准确反映该单词在句子中的实际含义
- 干扰释义应与正确答案在含义上接近但明显不同，具有迷惑性
- 所有释义选项使用英文，长度控制在 3-10 词

请返回严格的 JSON 格式（只返回 JSON，不要任何额外文本）：
{
  "questions": [
    {
      "target_word": "单词",
      "sentence": "包含 *单词* 的完整英文句子",
      "options": ["正确英文释义", "干扰释义1", "干扰释义2", "干扰释义3"],
      "correct_definition": "正确英文释义"
    }
  ]
}`;

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEFAULT_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的考研英语老师，专门生成释义单选题。请严格按照 JSON 格式返回结果。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.5,
          max_tokens: 4000
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
      console.log('Definition questions AI response:', content.substring(0, 300) + '...');

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.questions && Array.isArray(parsed.questions)) {
            return parsed.questions.map((q: any) => ({
              target_word: q.target_word || '',
              sentence: q.sentence || '',
              options: Array.isArray(q.options) ? q.options : [],
              correct_definition: q.correct_definition || '',
            }));
          }
        } catch (parseError) {
          console.warn('JSON parse failed for definition questions, trying normalize');
          try {
            const fixedJson = this.normalizeJsonString(jsonMatch[0]);
            const parsed = JSON.parse(fixedJson);
            if (parsed.questions && Array.isArray(parsed.questions)) {
              return parsed.questions.map((q: any) => ({
                target_word: q.target_word || '',
                sentence: q.sentence || '',
                options: Array.isArray(q.options) ? q.options : [],
                correct_definition: q.correct_definition || '',
              }));
            }
          } catch (fixError) {
            console.error('Fixed JSON parse also failed:', fixError);
          }
        }
      }

      throw new Error('AI 返回格式异常，请重试');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Definition generation error:', error.message, error.response?.status);
      }
      throw new Error('释义单选题生成失败，请重试');
    }
  }

  private getRandomTheme(): string {
    const themes = ['科技', '生活', '历史', '自然', '科学'];
    return themes[Math.floor(Math.random() * themes.length)];
  }

  async extractWordsFromText(text: string): Promise<string[]> {
    const prompt = `请从以下考研英语文本中提取出所有重要的生词（考研高频词、易错词、熟词僻义）：\n\n${text}\n\n请只返回单词列表，每行一个单词，不要包含其他内容。`;

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/chat/completions`,
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

  buildBatchAnalysisPrompt(words: string[]): string {
    return `请批量分析以下单词的考研英语用法，返回严格的JSON格式：

单词列表：${words.join(', ')}

要求：
1. 只返回JSON，不要任何额外文本或说明
2. 确保JSON格式正确，所有字符串都用双引号
3. 每个单词提供1-2个重要释义，释义必须使用中文
4. 其他字段如词根词缀分析、相似词提醒也请用中文
5. 提供难度等级(1-5)

提示：如果字段值中需要引用单词或短语，请使用中文书名号「」或单引号，避免未转义的双引号。

示例格式：
{
  "results": {
    "单词": {
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
      "suggestedDifficulty": 3
    }
  }
`;
  }

  buildWordAnalysisPrompt(word: string): string {
    return `请分析单词 "${word}" 的考研英语用法，提供以下信息：

1. 考研英语二最常考的3-5个释义（按重要性排序，特别标注熟词僻义）
2. 每个释义配一个考研真题风格的例句
3. 1-2个形近词或易混词提醒
4. 简单的词根词缀分析（帮助记忆）
5. 难度等级建议（1-5）

难度等级说明：
- 1-2: 高频基础词，考研必掌握
- 3: 普通考研词汇
- 4-5: 低频词或熟词僻义，需要重点复习

请用以下JSON格式返回（确保是纯JSON，不要额外文本）：
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
  ],
  "suggestedDifficulty": 3
}

要求：
- 只关注考研英语二的考点
- 所有释义必须使用中文，不要输出英文释义
- 熟词僻义要特别标注
- 例句要符合考研真题风格
- 形近词要真正容易混淆的
- 难度等级要根据单词的考研重要性和理解难度综合判断
- 如果字段值中需要引用，请使用中文书名号「」或单引号，避免未转义的双引号
- 只返回JSON，不要任何额外说明或文本`;
  }

  buildContentGenerationPrompt(words: string[], type: string): string {
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

    单词列表：${words.join(', ')}`;
  }

  normalizeJsonString(jsonString: string): string {
    let fixed = jsonString
      // 移除尾部多余逗号
      .replace(/,\s*([}\]])/g, '$1')
      // 修复单引号字符串
      .replace(/:\s*'([^']*)'/g, ': "$1"');

    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];

      if (!inString) {
        if (char === '"' && !escaped) {
          inString = true;
        }
        result += char;
        escaped = char === '\\' && !escaped;
        continue;
      }

      if (char === '\\' && !escaped) {
        result += char;
        escaped = true;
        continue;
      }

      if (char === '\n' || char === '\r') {
        result += '\\n';
        escaped = false;
        continue;
      }

      if (char === '"' && !escaped) {
        let j = i + 1;
        while (j < fixed.length && /\s/.test(fixed[j])) {
          j++;
        }
        const next = fixed[j] || '';
        if (next === ',' || next === '}' || next === ']' || next === '') {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
        escaped = false;
        continue;
      }

      result += char;
      escaped = false;
    }

    return result;
  }

  parseBatchAIResponse(content: string): Map<string, AIResponse> {
    const results = new Map<string, AIResponse>();

    try {
      // 提取JSON内容，处理可能的额外文本
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`未找到JSON内容，响应总长度=${content.length}，前200字符:`, content.substring(0, 200));
        return results;
      }

      console.log('AI响应JSON字符串长度:', jsonMatch[0].length);

      // 尝试解析JSON
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (jsonError) {
        console.error('JSON解析失败:', jsonError);
        console.log('AI响应内容:', content.substring(0, 500));

        const fixedJson = this.normalizeJsonString(jsonMatch[0]);
        try {
          parsed = JSON.parse(fixedJson);
          console.log('通过 normalizeJsonString 成功解析JSON');
        } catch (fixError) {
          console.error('修复后解析仍失败:', fixError, '响应尾部200字符:', content.substring(Math.max(0, content.length - 200)));
          return results;
        }
      }

      if (parsed.results) {
        Object.entries(parsed.results).forEach(([word, data]: [string, any]) => {
          results.set(word, {
            definitions: data.definitions || [],
            etymology: data.etymology || '',
            similar_words: Array.isArray(data.similar_words) ? data.similar_words : [],
            suggestedDifficulty: data.suggestedDifficulty || 3
          });
        });
        console.log('成功解析单词数量:', results.size);
      } else {
        console.warn('AI响应中未找到results字段，完整响应:', parsed);
      }
    } catch (error) {
      console.error('Parse batch AI response error:', error);
    }

    return results;
  }

  parseAIResponse(content: string): AIResponse {
    try {
      // 尝试提取JSON内容 - 支持多种格式
      let jsonString = '';

      // 方法1: 直接匹配最外层JSON对象
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }

      // 如果没有找到，尝试查找 "```json" 包裹的内容
      if (!jsonString) {
        const codeBlockMatch = content.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1];
        }
      }

      // 如果还是没有，尝试查找任何代码块
      if (!jsonString) {
        const codeBlockMatch = content.match(/```\s*\n?([\s\S]*?)\n?\s*```/);
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1];
        }
      }

      if (jsonString) {
        try {
          return JSON.parse(jsonString);
        } catch (firstError) {
          console.warn('首轮 JSON 解析失败，尝试修复格式:', firstError.message);

          const fixedJson = this.normalizeJsonString(jsonString);

          try {
            return JSON.parse(fixedJson);
          } catch (secondError) {
            console.error('修复后 JSON 解析仍失败:', secondError.message);
            console.error('原始内容长度:', content.length);
            console.error('JSON字符串长度:', jsonString.length);
            console.error('前500字符:', content.substring(0, 500));
          }
        }
      }

      // 如果无法解析JSON，返回基本结构
      return {
        definitions: [],
        etymology: '',
        similar_words: [],
        suggestedDifficulty: 3
      };
    } catch (error) {
      console.error('Parse AI response error:', error);
      return {
        definitions: [],
        etymology: '',
        similar_words: [],
        suggestedDifficulty: 3
      };
    }
  }
}

export default AIService;