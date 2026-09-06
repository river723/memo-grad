/**
 * AI 代理路由：前端不再直接调用 DeepSeek API，
 * 而是调用 POST /api/ai/:action，由后端代理并记录用量。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config';
import { ApiError } from '../errors';
import { getEntitlement } from '../services/subscriptionService';
import { prisma } from '../db';
import { ensureWordHighlight } from '../utils/highlightWord';

/**
 * 配额守卫：调用前校验用户当月是否还有剩余次数。
 * 免费用户（FREE_MONTHLY_AI_QUOTA=0）直接拒，Pro 用户超配额也拒。
 * 返回实际消耗的次数（用于调用后写 ai_usage）。
 */
async function checkQuota(userId: string): Promise<number> {
  const entitlement = await getEntitlement(userId);
  if (!entitlement.isPro && entitlement.quota.remaining <= 0) {
    throw ApiError.paymentRequired(
      'QUOTA_EXCEEDED',
      `本月 AI 调用次数已用完（剩余 ${entitlement.quota.remaining} 次），请订阅解锁更多次数。`,
      { remaining: entitlement.quota.remaining },
    );
  }
  return entitlement.quota.remaining > 0 ? 1 : 0;
}

/** 调用 OpenAI 兼容 AI 上游（默认 DeepSeek，可指向任何兼容服务：智谱/Kimi/Qwen/OpenAI/Ollama/自部署等）。 */

/**
 * 上游 fetch 超时。释义单选每题带中文翻译，生成很慢，历史实测会超过 30s；
 * 这里取 90s，且必须小于前端代理超时（src/constants API_CONFIG.TIMEOUT=120s）——
 * 否则前端先中断，请求变"孤魂"继续耗上游并扣配额。
 */
const AI_UPSTREAM_TIMEOUT_MS = 90_000;

async function chat(
  messages: any[],
  maxTokens: number,
  temperature: number,
  log: import('pino').BaseLogger | { error: (...args: unknown[]) => void } = console,
): Promise<string> {
  const key = config.ai.apiKey;
  if (!key) throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 服务未配置 API Key');

  let res: Response;
  try {
    res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: config.ai.model, messages, temperature, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    // 网络层失败（DNS/连接/TLS/超时）以及 undici 组装请求时抛的异常
    // （如 Authorization 头含非 ASCII 字符的 ByteString TypeError）都在这里。
    // 不包成 ApiError 就会漏到全局兜底，前端只看到含糊的"服务器内部错误"。
    // AbortSignal.timeout 触发的是 TimeoutError，单独给一个可行动的文案。
    if ((err as Error)?.name === 'TimeoutError') {
      log.error({ err }, 'AI 上游响应超时');
      throw ApiError.internal(
        'AI_UPSTREAM_TIMEOUT',
        `AI 服务响应超时（${AI_UPSTREAM_TIMEOUT_MS / 1000} 秒），请稍后重试，或减少出题数量`,
      );
    }
    log.error({ err }, 'AI 上游连接失败');
    throw ApiError.internal(
      'AI_UPSTREAM_UNREACHABLE',
      `无法连接 AI 服务：${(err as Error).message}`,
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw ApiError.internal('AI_UPSTREAM_ERROR', `AI上游错误(${res.status}): ${text.slice(0, 200)}`);
  }

  // Node 内置 fetch 的 res.json() 类型为 unknown,这里按 OpenAI 兼容响应结构取值
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content || '';
}

/** 从AI返回文本中提取 JSON */
function extractJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export default async function aiRoutes(app: FastifyInstance) {
  // 所有端点需登录：复用全局 authGuard，它会显式调 request.jwtVerify()
  // 并校验 token type / 账号状态，单纯读 request.userId 是不会自动验签的。
  app.addHook('preHandler', app.authGuard);

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

    const userId = request.userId!;

    // 配额守卫：免费用户配额耗尽或未订阅时拒绝
    const canUse = await checkQuota(userId);

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
        const content = await chat([
          { role: 'system', content: '你是一个专业的考研英语老师。请严格用 JSON 格式回答。' },
          { role: 'user', content: prompt },
        ], 1000, 0.3, request.log);
        result = extractJson(content) || { definitions: [], etymology: '', similar_words: [] };
        break;
      }

      case 'analyzeWords': {
        if (!Array.isArray(body.words) || body.words.length === 0) {
          throw ApiError.badRequest('INVALID_PARAMS', 'words 必须是非空数组');
        }
        const prompt = `请批量分析以下单词的考研用法：${body.words.join(', ')}。\n返回JSON：{"results":{"单词":{"definitions":[...],"etymology":"","suggestedDifficulty":3,"examFrequency":3,"memoryTip":""}}}`;
        const content = await chat([
          { role: 'system', content: '你是考研英语老师，请用严格 JSON 格式批量分析单词' },
          { role: 'user', content: prompt },
        ], 8000, 0.3, request.log);
        const parsed = extractJson(content);
        result = parsed?.results ? Object.fromEntries(Object.entries(parsed.results)) : {};
        break;
      }

      case 'generateFunArticle': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const prompt = `用以下单词写一篇英文短文并翻译：${body.words.join(', ')}。\n主题：${body.theme || '随机'}。\n长度约${body.targetLength || 200}词。\n请返回JSON：{"title":"标题","content":"英文正文","translation":"中文翻译"}`;
        const content = await chat([
          { role: 'system', content: '你是英语创意写手，请严格用 JSON 格式回答' },
          { role: 'user', content: prompt },
        ], 4000, 0.7, request.log);
        const parsed = extractJson(content) || {};
        result = { title: parsed.title || '无标题', content: parsed.content || content, translation: parsed.translation || '' };
        break;
      }

      case 'generateClozeQuestions': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const wlist = body.words.map((w: any) => `- ${w.word}: ${w.meaning}`).join('\n');
        const prompt = `为以下单词各生成一个完形填空：\n${wlist}\n\n返回JSON：{"questions":[{"target_word":"","sentence":"含[BLANK]的句子","options":["A","B","C","D"],"correct_answer":"正确选项","chinese_hint":"中文提示"}]}`;
        const content = await chat([
          { role: 'system', content: '你是考研英语出题老师，请严格用 JSON 格式回答' },
          { role: 'user', content: prompt },
        ], 4000, 0.5, request.log);
        const parsed = extractJson(content);
        result = parsed?.questions || [];
        break;
      }

      case 'generateDefinitionQuestions': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const wlist = body.words.map((w: any) => `- ${w.word}: ${w.meaning}`).join('\n');
        const prompt = `为以下单词各生成一个释义单选题：\n${wlist}\n\n严格要求：sentence 中必须用一对星号把目标词（或其屈折形式，如 abandoned、making）包裹起来，例如 "The *diligent* student studied all night."，这是划线高亮的唯一依据，绝不能省略。选项必须是英文释义：提供 4 个选项，1 个正确释义 + 3 个干扰释义，所有选项用英文、长度 3-10 词，干扰项与正确项含义接近但明显不同。\n返回JSON：{"questions":[{"target_word":"","sentence":"用*word*标记目标词的句子","chinese_translation":"该句子的完整中文翻译","options":["正确英文释义","干扰释义1","干扰释义2","干扰释义3"],"correct_definition":"正确英文释义"}]}`;
        const content = await chat([
          { role: 'system', content: '你是考研英语出题老师，请严格用 JSON 格式回答' },
          { role: 'user', content: prompt },
        ], 4000, 0.5, request.log);
        const parsed = extractJson(content);
        const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
        // AI 可能漏加星号：返回前按目标词（含屈折变体）尽力补标，保证前端能划线
        result = rawQuestions.map((q: any) => ({
          ...q,
          sentence: ensureWordHighlight(q.sentence || '', q.target_word || ''),
        }));
        break;
      }

      case 'generateStudyContent': {
        if (!Array.isArray(body.words)) throw ApiError.badRequest('INVALID_PARAMS', '缺少 words');
        const type = body.type || 'passage';
        const prompt = `用以下单词生成考研英语${type === 'passage' ? '阅读短文' : type === 'quiz' ? '选择题' : '作文句型'}：${body.words.join(', ')}`;
        result = await chat([
          { role: 'system', content: '你是考研英语老师' },
          { role: 'user', content: prompt },
        ], 1500, 0.5, request.log);
        break;
      }

      case 'generateRealExamExplanation': {
        if (!body.options || !body.correctAnswer) throw ApiError.badRequest('INVALID_PARAMS', '参数不全');
        const subject = body.mode === 'reading' ? `题干：${body.stem || ''}` :
          body.mode === 'newtype' ? `新题型第${body.blankIndex || '?'}题` :
          `完形填空第${body.blankIndex || '?'}空`;
        const prompt = `请为以下考研英语真题编写简短中文解析：\n${subject}\n选项：${body.options.join('\n')}\n正确答案：${body.correctAnswer}\n${body.userAnswer && body.userAnswer !== body.correctAnswer ? `考生误选：${body.userAnswer}` : ''}`;
        result = await chat([
          { role: 'system', content: '你是考研英语辅导老师，用中文撰写真题解析' },
          { role: 'user', content: prompt },
        ], 600, 0.4, request.log);
        break;
      }

      case 'extractWordsFromText': {
        if (!body.text) throw ApiError.badRequest('INVALID_PARAMS', '缺少 text');
        result = await chat([
          { role: 'system', content: '你是考研英语老师，从文本中提取生词。每行一个词，不要其他内容。' },
          { role: 'user', content: `请从以下文本提取考研重点词汇：\n${body.text}` },
        ], 500, 0.3, request.log);
        result = (result as string).split('\n').filter((w: string) => w.trim());
        break;
      }

      default:
        throw ApiError.badRequest('INVALID_ACTION', `未知动作: ${action}`);
    }

    // 记录 AI 调用量（仅成功调用才扣减配额）
    if (canUse > 0) {
      await prisma.aiUsage.create({
        data: { userId, action, model: config.ai.model, promptTokens: 0, outputTokens: 0, latencyMs: 0, success: true },
      });
    }

    return { success: true, data: result };
  });
}
