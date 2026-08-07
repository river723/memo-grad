/**
 * AI 代理路由：前端不再直接调用 DeepSeek API，
 * 而是调用 POST /api/ai/:action，由后端代理并记录用量。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config';
import { ApiError } from '../errors';

/** 调用 DeepSeek API */
async function deepseek(messages: any[], maxTokens: number, temperature: number): Promise<string> {
  const key = config.ai.apiKey;
  if (!key) throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 服务未配置 API Key');

  const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: config.ai.model, messages, temperature, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw ApiError.internal('AI_UPSTREAM_ERROR', `AI上游错误(${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/** 从AI返回文本中提取 JSON */
function extractJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export default async function aiRoutes(app: FastifyInstance) {
  // 所有端点需登录
  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (!request.userId) throw ApiError.unauthorized('NOT_AUTHENTICATED', '请先登录');
  });

  // 通用 AI 代理端点
  app.post('/:action', async (request: FastifyRequest) => {
    const action = (request.params as any).action as string;
    const body = request.body as any;
    const validActions = [
      'analyzeWord', 'analyzeWords', 'generateFunArticle',
      'generateClozeQuestions', 'generateDefinitionQuestions',
      'generateStudyContent', 'generateRealExamExplanation', 'extractWordsFromText',
    ];
    if (!validActions.includes(action)) {
      throw ApiError.badRequest('INVALID_ACTION', `不支持的动作: ${action}`);
    }

    let result: any;

    switch (action) {
      case 'analyzeWord': {
        if (!body.word) throw ApiError.badRequest('INVALID_PARAMS', '缺少 word 参数');
        const prompt = `请分析单词 "${body.word}" 的考研英语用法。按 JSON 返回（只返回 JSON）：
{
  "definitions": [{"part_of_speech":"词性","meaning":"释义","example":"例句","is_core":true,"is_rare_sense":false}],
  "etymology":"词根分析",
  "similar_words": [{"word":"词","relation":"spelling/meaning/root","description":"区别"}],
  "suggestedDifficulty":3, "examFrequency":3, "memoryTip":"记忆口诀"
}`;
        const content = await deepseek([
          { role: 'system', content: '你是一个专业的考研英语老师。请严格用 JSON 格式回答。' },
          { role: 'user', content: prompt },
        ], 1000, 0.3);
        result = extractJson(content) || { definitions: [], etymology: '', similar_words: [] };
        break;
      }

      case 'analyzeWords': {
        if (!Array.isArray(body.words) || body.words.length === 0) {
          throw ApiError.badRequest('INVALID_PARAMS', 'words 必须是非空数组');
        }
        const prompt = `请批量分析以下单词的考研用法：${body.words.join(', ')}。\n返回JSON：{"results":{"单词":{"definitions":[...],"etymology":"","suggestedDifficulty":3,"examFrequency":3,"memoryTip":""}}}`;
        const content = await deepseek([
          { role: 'system', content: '你是考研英语老师，请用严格 JSON 格式批量分析单词' },
          { role: 'user', content: prompt },
        ], 8000, 0.3);
        const parsed = extractJson(content);
        result = parsed?.results ? Object.fromEntries(Object.entries(parsed.results)) : {};
        break;
      }

      case 'generateFunArticle': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const prompt = `用以下单词写一篇英文短文并翻译：${body.words.join(', ')}。\n主题：${body.theme || '随机'}。\n长度约${body.targetLength || 200}词。\n请返回JSON：{"title":"标题","content":"英文正文","translation":"中文翻译"}`;
        const content = await deepseek([
          { role: 'system', content: '你是英语创意写手，请严格用 JSON 格式回答' },
          { role: 'user', content: prompt },
        ], 4000, 0.7);
        const parsed = extractJson(content) || {};
        result = { title: parsed.title || '无标题', content: parsed.content || content, translation: parsed.translation || '' };
        break;
      }

      case 'generateClozeQuestions': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const wlist = body.words.map((w: any) => `- ${w.word}: ${w.meaning}`).join('\n');
        const prompt = `为以下单词各生成一个完形填空：\n${wlist}\n\n返回JSON：{"questions":[{"target_word":"","sentence":"含[BLANK]的句子","options":["A","B","C","D"],"correct_answer":"正确选项","chinese_hint":"中文提示"}]}`;
        const content = await deepseek([
          { role: 'system', content: '你是考研英语出题老师，请严格用 JSON 格式回答' },
          { role: 'user', content: prompt },
        ], 4000, 0.5);
        const parsed = extractJson(content);
        result = parsed?.questions || [];
        break;
      }

      case 'generateDefinitionQuestions': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const wlist = body.words.map((w: any) => `- ${w.word}: ${w.meaning}`).join('\n');
        const prompt = `为以下单词各生成一个释义单选题：\n${wlist}\n\n返回JSON：{"questions":[{"target_word":"","sentence":"含*word*的句子","options":["释义A","释义B","释义C","释义D"],"correct_definition":"正确释义"}]}`;
        const content = await deepseek([
          { role: 'system', content: '你是考研英语出题老师，请严格用 JSON 格式回答' },
          { role: 'user', content: prompt },
        ], 4000, 0.5);
        const parsed = extractJson(content);
        result = parsed?.questions || [];
        break;
      }

      case 'generateStudyContent': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const type = body.type || 'passage';
        const prompt = `用以下单词生成考研英语${type === 'passage' ? '阅读短文' : type === 'quiz' ? '选择题' : '作文句型'}：${body.words.join(', ')}`;
        result = await deepseek([
          { role: 'system', content: '你是考研英语老师' },
          { role: 'user', content: prompt },
        ], 1500, 0.5);
        break;
      }

      case 'generateRealExamExplanation': {
        if (!body.options || !body.correctAnswer) throw ApiError.badRequest('INVALID_PARAMS', '参数不全');
        const subject = body.mode === 'reading' ? `题干：${body.stem || ''}` :
          body.mode === 'newtype' ? `新题型第${body.blankIndex || '?'}题` :
          `完形填空第${body.blankIndex || '?'}空`;
        const prompt = `请为以下考研英语真题编写简短中文解析：\n${subject}\n选项：${body.options.join('\n')}\n正确答案：${body.correctAnswer}\n${body.userAnswer && body.userAnswer !== body.correctAnswer ? `考生误选：${body.userAnswer}` : ''}`;
        result = await deepseek([
          { role: 'system', content: '你是考研英语辅导老师，用中文撰写真题解析' },
          { role: 'user', content: prompt },
        ], 600, 0.4);
        break;
      }

      case 'extractWordsFromText': {
        if (!body.text) throw ApiError.badRequest('INVALID_PARAMS', '缺少 text');
        result = await deepseek([
          { role: 'system', content: '你是考研英语老师，从文本中提取生词。每行一个词，不要其他内容。' },
          { role: 'user', content: `请从以下文本提取考研重点词汇：\n${body.text}` },
        ], 500, 0.3);
        result = (result as string).split('\n').filter((w: string) => w.trim());
        break;
      }

      default:
        throw ApiError.badRequest('INVALID_ACTION', `未知动作: ${action}`);
    }

    return { success: true, data: result };
  });
}
