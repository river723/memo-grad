// scripts/generateStories.js
//
// 读取 src/data/worddict.json 中的 4801 个考研单词，调用 AI 生成一系列
// 分章节的英文故事，将所有单词自然融入故事情节中，并附中文翻译。
// 输出到 src/data/stories.json，供阅读 Tab 的 StoryList/StoryDetail 使用。
//
// 用法：
//   API_KEY=sk-xxx node scripts/generateStories.js
//   API_KEY=sk-xxx START_CHAPTER=5 node scripts/generateStories.js  # 从第5章续跑（增量）
//   API_KEY=sk-xxx CHAPTER_IDS=1,6,7,10,16,18 node scripts/generateStories.js  # 原地重生成指定章节
//
// 环境变量：
//   API_KEY         必填，AI provider 的 API Key（默认走 DeepSeek）
//   API_BASE        可选，默认 https://api.deepseek.com/v1
//   API_MODEL       可选，默认 deepseek-chat
//   CHAPTERS        可选，总章节数（决定单词分组数量），默认 20
//   MAX_CHAPTERS    可选，本次实际生成的章节数（用于测试少量章节），默认等于 CHAPTERS
//   BATCH_SIZE      可选，每批次目标词数，默认 60（越小越容易全覆盖）
//   START_CHAPTER   可选，从第几章开始（断点续传），默认 1
//   CHAPTER_IDS     可选，逗号分隔的章节号，原地重生成这些章节（保留其他章节），优先于 START_CHAPTER
//   RETRY           可选，单批失败/重复句/译文段数不符的重试次数，默认 3
//   DELAY_MS        可选，请求间延迟毫秒数，默认 1500
//
// 质量保障：每批生成后检测与上文的重复句、校验译文段数与英文一致，不符则重试；
//   章末统一经 remediateStories.js 的 processChapter 清理（去残留重复句、拆 60-90 词段、
//   译文段锁步对齐）。不引入 npm 依赖，只用 Node 内置模块。

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { processChapter } = require('./remediateStories.js');

const ROOT = path.resolve(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'src/data/worddict.json');
const OUT_PATH = path.join(ROOT, 'src/data/stories.json');

const API_KEY = process.env.API_KEY || '';
const API_BASE = process.env.API_BASE || 'https://api.deepseek.com/v1';
const API_MODEL = process.env.API_MODEL || 'deepseek-v4-flash';
const CHAPTERS = Number(process.env.CHAPTERS || 20);
const MAX_CHAPTERS = Number(process.env.MAX_CHAPTERS || CHAPTERS);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 60);
const START_CHAPTER = Number(process.env.START_CHAPTER || 1);
const RETRY = Number(process.env.RETRY || 3);
const DELAY_MS = Number(process.env.DELAY_MS || 1500);
// 非连续原地重生成指定章节（不丢失其他章节），如 CHAPTER_IDS=1,6,7,10,16,18
const CHAPTER_IDS = process.env.CHAPTER_IDS
  ? process.env.CHAPTER_IDS.split(',').map((x) => Number(x.trim())).filter(Boolean)
  : null;

if (!API_KEY) {
  console.error('❌ 缺少 API_KEY 环境变量');
  process.exit(1);
}

// 故事主线设定 —— 每章一个场景，串联主角的冒险旅程
const SERIES_TITLE = '星际漫游者：4801词奇幻之旅';
const STORY_ARC = [
  { theme: 'adventure', setting: '主角 Alex 在图书馆意外触发一本古老星图，被卷入星际之门', location: '古老图书馆' },
  { theme: 'sciFi', setting: 'Alex 醒来发现自己在一艘失控的星际飞船上，遇到 AI 助手 Nova', location: '星际飞船' },
  { theme: 'mystery', setting: '飞船降落在废弃的殖民星球，Alex 发现前殖民者留下的加密日记', location: '废弃殖民地' },
  { theme: 'fantasy', setting: 'Alex 穿过传送门进入一个魔法世界，遇到女巫 Elara 与她的图书馆', location: '魔法森林' },
  { theme: 'adventure', setting: 'Elara 交给 Alex 寻找"知识水晶"的任务，穿越幽暗峡谷', location: '幽暗峡谷' },
  { theme: 'nature', setting: 'Alex 与 Nova 抵达云端之城，遇见会说话的动物学者', location: '云端之城' },
  { theme: 'history', setting: '在古老遗迹中，Alex 发现失落文明的壁画，解读它们的历史', location: '失落遗迹' },
  { theme: 'sciFi', setting: 'Alex 被吸入平行时空，遇见另一个版本的自己', location: '平行时空实验室' },
  { theme: 'mystery', setting: '一场看似平常的晚宴上，发生了神秘的失踪案', location: '贵族庄园' },
  { theme: 'adventure', setting: 'Alex 加入探险队，深入未知的地下溶洞', location: '地下溶洞' },
  { theme: 'fantasy', setting: '与巨龙 Vermilion 谈判，取得龙族的信任', location: '龙巢' },
  { theme: 'nature', setting: '海底王国的救援任务，Alex 遇到海洋生物学家', location: '深海城市' },
  { theme: 'history', setting: '穿越回工业革命时期的伦敦，体验蒸汽时代', location: '维多利亚时代伦敦' },
  { theme: 'sciFi', setting: '发现远古外星文明的通讯信号，Alex 与团队破译密码', location: '射电天文台' },
  { theme: 'romance', setting: 'Alex 与神秘旅行者 Iris 在小镇咖啡馆相遇', location: '欧洲小镇' },
  { theme: 'adventure', setting: '攀登传说中的"世界之巅"，遭遇雪崩与野生动物', location: '雪山之巅' },
  { theme: 'mystery', setting: '古墓探秘，破解一系列象征符号谜题', location: '沙漠古墓' },
  { theme: 'fantasy', setting: '进入梦境世界，Alex 面对内心的恐惧与欲望', location: '梦境宫殿' },
  { theme: 'sciFi', setting: 'Alex 与 Nova 阻止一场即将毁灭星球的能量风暴', location: '能量中枢' },
  { theme: 'adventure', setting: '所有伙伴汇合，Alex 决定是否返回原来的世界', location: '星际之门' },
];

/**
 * 加载词典，返回单词列表（不做排序）。
 */
function loadWords() {
  const raw = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
  const words = Object.keys(raw.results || {});
  console.log(`📚 从 worddict.json 加载了 ${words.length} 个单词`);
  return words;
}

/**
 * 确定性伪随机数生成器（mulberry32）。
 * 固定 seed 保证每次运行的打乱结果一致，方便断点续传时词的分组不变。
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 用确定性 seed 打乱数组（Fisher–Yates），返回新数组，不修改原数组。
 */
function shuffleDeterministic(arr, seed) {
  const a = arr.slice();
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 将单词列表均分为 N 组，每组尽量等大。
 */
function chunkWords(words, n) {
  const size = Math.ceil(words.length / n);
  const chunks = [];
  for (let i = 0; i < n; i++) {
    chunks.push(words.slice(i * size, (i + 1) * size));
  }
  return chunks;
}

/**
 * 调用 AI Chat Completion API。返回 raw content 字符串。
 */
function callAI(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: API_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });

    const url = new URL(`${API_BASE}/chat/completions`);
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 180000,
      },
      (res) => {
        // 用 Buffer 数组累积，最后一次性用 UTF-8 解码。
        // 不能用 `data += chunk` 字符串拼接：chunk 是 Buffer，隐式转字符串时
        // 用默认（latin1）编码，会把跨 chunk 边界的中文多字节字符切碎，
        // 导致最终 JSON.parse 后的中文出现 U+FFFD (�) 替换字符。
        const bufs = [];
        res.on('data', (chunk) => bufs.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(bufs).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`API ${res.statusCode} @ ${url.href}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices[0].message.content);
          } catch (e) {
            reject(new Error(`Parse response failed: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * 从 AI 返回的文本中提取 JSON 对象。
 * 优先尝试从标准 API 响应结构中提取 `choices[0].message.content`；
 * 若失败，再回退到查找首个 {...} 这样的 JSON 代码块。
 */
function extractJson(content) {
  // 尝试解析整个响应获取 standard OpenAI 格式
  try {
    const full = JSON.parse(content);
    if (full.choices && full.choices[0] && full.choices[0].message) {
      const inner = full.choices[0].message.content;
      // inner 里面还是 JSON 字符串？再解析一次
      if (typeof inner === 'string') {
        const match = inner.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      }
    }
  } catch { /* fall through */ }

  // 回退：直接查找 JSON 代码块
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    // 尝试打印诊断：看看 AI 返回了什么结构
    const preview = content.slice(0, 400).replace(/\n/g, '\\n');
    throw new Error(`未找到 JSON 内容（前400字：${preview}）`);
  }
  return JSON.parse(match[0]);
}

/**
 * 清洗 AI 生成的 content，剔除混入的 JSON 字段标签行。
 * AI 有时会把 "Translation: ..." / "Summary: ..." 当作正文写入 content 字段。
 */
function sanitizeContent(text) {
  if (!text) return '';
  return text
    .split(/\n\n+/)
    .filter(p => {
      const t = p.trim();
      if (!t) return false;
      // 剔除以 Translation: / Summary: / translation: / summary: 开头的段
      if (/^(Translation|Summary|translation|summary)\s*[:：]/.test(t)) return false;
      // 剔除混入正文的 "Chapter N: 标题" 行
      if (/^Chapter\s+\d+\s*[:：]/i.test(t)) return false;
      return true;
    })
    .join('\n\n');
}

/**
 * 检测 newText 中与 prevText 重复的整句（章内循环生成的迹象）。
 * 仅比较长度 >= 30 的句子，归一化（trim/小写/压缩空白）后比对。
 * 返回去重后的重复句子列表（归一化形式），用于在重试时提示 AI 避开。
 */
function findDupSentences(newText, prevText) {
  if (!prevText || !newText) return [];
  const prevSet = new Set(
    (prevText.match(/[^.!?]+[.!?]+/g) || [])
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))
      .filter((s) => s.length >= 30)
  );
  const dups = [];
  const seen = new Set();
  for (const raw of newText.match(/[^.!?]+[.!?]+/g) || []) {
    const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (s.length < 30) continue;
    if (prevSet.has(s) && !seen.has(s)) {
      dups.push(s);
      seen.add(s);
    }
  }
  return dups;
}

/**
 * 检测生成内容中缺失了哪些目标词。
 * 匹配策略：允许目标词后追加常见英语后缀（复数、时态、派生词），
 * 例如目标词 "illuminate" 认可 illuminate/illuminates/illuminated/illuminating。
 */
function findMissingWords(content, words) {
  const lower = content.toLowerCase();
  return words.filter((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b<word>\w*\b 允许词尾追加任意字母（覆盖 -s/-es/-ed/-ing/-ly/-tion/-er/-ist 等）
    const pattern = new RegExp(`\\b${escaped}\\w*\\b`, 'i');
    return !pattern.test(lower);
  });
}

const SYSTEM_PROMPT =
  '你是一位优秀的英语小说家兼翻译，擅长创作情节生动、语言自然的连载故事，' +
  '并能将中文流畅准确地翻译成英语。你要根据给定的单词列表和场景设定，' +
  '创作故事段落，把所有指定的目标单词自然地融入英文叙事（包括专有名词、生僻词，' +
  '可通过角色姓名、地名、书名、对话引用、比喻等方式使用），同时保持文学性和可读性。' +
  '严格禁止：使用 * / _ / 【】 等任何特殊符号包裹或标注单词；' +
  '严格禁止：把词性名称（如 noun、verb、adjective）当作故事内容写进正文；' +
  '严格禁止：重复复制上文段落作为回答；' +
  '严格禁止：在中文翻译字段中夹杂未翻译的英文单词（人名如 Alex/Elara 除外，其余英文词必须译成中文）。' +
  '严格禁止：复用本章已出现过的整句（尤其是"the X of Y was a Z"这类格言式总结句），每段必须推进新剧情、提供新信息；' +
  '格式要求：英文正文每段 60-90 词，段落之间用空行分隔；' +
  '对照要求：translation 的段落数必须与 content 完全一致，且逐段对应（第 i 段英文对应第 i 段中文），不要合并或拆散段落。';

/**
 * 构造首批（开场段落）的 prompt —— 需要产出章节标题、开场英文+译文、以及本批词覆盖。
 */
function buildOpeningPrompt(chapterIdx, arc, batchWords, prevSummary) {
  return `请为一部连载英文小说创作第 ${chapterIdx + 1} 章的【开场部分】。

【本章场景】${arc.setting}
【故事地点】${arc.location}
【故事基调】${arc.theme}
${prevSummary ? `【上一章梗概】${prevSummary}\n` : ''}
【本批必须使用的英文单词】（共 ${batchWords.length} 个，每个至少出现一次；专有名词/生僻词可作为角色名、地名、引用文献名、对话内容等出现）
${batchWords.join(', ')}

【创作要求】
1. 开场部分英文 500-700 词，交代场景与主角境况
2. 上述每个英文单词必须以其原形或常见变形（复数、时态、派生词）出现在英文正文中
3. 目标词以外的词汇简单易懂
4. 英文正文每段 60-90 词，段落之间用空行分隔；每段必须推进新剧情，禁止复用任何整句
5. 章节中文标题 8 字以内（如"星门之启"）
6. 中文翻译的段落数必须与英文完全一致，逐段对应

严格返回以下 JSON（无额外文本）：
{
  "title": "章节中文标题",
  "content": "英文开场正文",
  "translation": "对应中文翻译"
}`;
}

/**
 * 构造后续批次（延续段落）的 prompt —— 承接上一段剧情，把本批词融入。
 */
function buildContinuationPrompt(chapterIdx, arc, batchWords, prevEnglishTail, isLast) {
  return `请为第 ${chapterIdx + 1} 章续写下一段英文剧情。

【本章场景】${arc.setting}
【故事地点】${arc.location}
【上文结尾】${prevEnglishTail.slice(-500)}

【本批必须使用的英文单词】（共 ${batchWords.length} 个，每个至少出现一次；专有名词/生僻词可作为角色名、地名、书名、对话引用等出现）
${batchWords.join(', ')}

【创作要求】
1. 续写 500-700 词的英文段落，情节自然承接上文
2. 上述每个英文单词必须以其原形或常见变形出现在英文正文中
3. 目标词以外的词汇简单易懂
4. 英文正文每段 60-90 词，段落之间用空行分隔；每段必须推进新剧情，禁止复用上文任何整句
5. 提供本段英文对应的中文翻译，段落数与英文一致、逐段对应
${isLast ? '6. 本段是本章最后一段，请给出合适的段落收尾，并另附本章一句话中文梗概（15 字内）\n' : ''}

严格返回以下 JSON（无额外文本）：
{
  "content": "英文续写正文",
  "translation": "对应中文翻译"${isLast ? ',\n  "summary": "本章一句话中文梗概"' : ''}
}`;
}

/**
 * 构造补齐段落的 prompt -- 承接本章主线剧情续写，自然融入缺词。
 * 不再使用独立的回忆/梦境/日记插曲，避免与主线割裂。
 */
function buildPatchPrompt(missingWords, arc, chapterTitle, prevEnglishTail) {
  return `请为第 "${chapterTitle}" 章续写一段承接主线的英文剧情（200-400 词），自然融入尚未使用的目标词。

【本章场景】${arc.setting}
【故事地点】${arc.location}
【上文结尾】${prevEnglishTail.slice(-400)}

【必须使用的英文单词】（共 ${missingWords.length} 个，每个至少出现一次；专有名词/生僻词可作为角色名、地名、书名、对话引用等出现）
${missingWords.join(', ')}

【创作要求】
1. 续写一段连贯的英文剧情，自然承接上文，不要写成独立的回忆/梦境/日记插曲
2. 上述每个英文单词必须以其原形或常见变形自然出现在正文中
3. 目标词以外的词汇简单易懂
4. 英文正文每段 60-90 词，段落之间用空行分隔；禁止复用上文任何整句
5. 不要用 * / 【 】 等符号标注目标词，保持自然
6. 提供对应中文翻译，段落数与英文一致、逐段对应

严格返回 JSON（无额外文本）：
{
  "content": "英文续写正文",
  "translation": "对应中文翻译"
}`;
}

/**
 * 拆分数组为固定大小的批次。
 */
function batchArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * 生成单章：主体分批生成 + 章末统一补齐。
 * 策略：
 *   1. 将章节的目标词分为若干批（默认每批 BATCH_SIZE 个）
 *   2. 首批用 opening prompt 产出标题 + 开场英文/译文
 *   3. 后续批用 continuation prompt 承接续写；每批生成后检测与上文的重复句、
 *      校验译文段数与英文一致，不符则重试（最多 RETRY 次）
 *   4. 主体生成完毕后，统一检查全章缺词，用承接主线续写补齐（不再用独立插曲）
 *   5. 章末经 processChapter 清理：去残留重复句、拆 60-90 词段、译文段锁步对齐
 */
async function generateChapter(chapterIdx, arc, targetWords, prevSummary) {
  const batches = batchArray(targetWords, BATCH_SIZE);
  console.log(`  分为 ${batches.length} 批生成（每批约 ${BATCH_SIZE} 词）`);

  let title = '';
  const contentParts = [];
  const translationParts = [];
  let summary = '';

  // 主体生成：只做承接式续写，不在批内做 patch
  for (let bi = 0; bi < batches.length; bi++) {
    const batchWords = batches[bi];
    const isFirst = bi === 0;
    const isLast = bi === batches.length - 1;
    const prevTail = contentParts.join('\n\n');

    let result = null;
    let batchContent = '';
    let batchTranslation = '';
    let lastErr;
    let avoidHint = '';
    for (let attempt = 1; attempt <= RETRY; attempt++) {
      try {
        let prompt = isFirst
          ? buildOpeningPrompt(chapterIdx, arc, batchWords, prevSummary)
          : buildContinuationPrompt(chapterIdx, arc, batchWords, prevTail, isLast);
        if (avoidHint) {
          prompt += `\n\n【重要】以下句子已在本章出现过，请勿再次使用或改写复用，每段必须推进新剧情：\n${avoidHint}`;
        }
        const raw = await callAI(prompt, SYSTEM_PROMPT);
        const candidate = extractJson(raw);
        const candContent = sanitizeContent(candidate.content || '');
        const candTranslation = sanitizeContent(candidate.translation || '');

        // 重复句检测 + 译文段落数校验
        const dups = findDupSentences(candContent, prevTail);
        const enParas = candContent.split(/\n\n+/).filter(Boolean);
        const zhParas = candTranslation.split(/\n\n+/).filter(Boolean);
        const parityOk = enParas.length === zhParas.length;

        if ((dups.length > 0 || !parityOk) && attempt < RETRY) {
          const reason = [
            dups.length > 0 ? `重复句 ${dups.length}` : '',
            !parityOk ? `译文段数不符(en=${enParas.length}/zh=${zhParas.length})` : '',
          ].filter(Boolean).join('、');
          console.log(`    批 ${bi + 1} 第 ${attempt}/${RETRY} 次：${reason}，重试`);
          if (dups.length > 0) avoidHint = dups.slice(0, 8).join('\n');
          lastErr = new Error(reason);
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }
        result = candidate;
        batchContent = candContent;
        batchTranslation = candTranslation;
        break;
      } catch (err) {
        console.log(`    批 ${bi + 1} 第 ${attempt}/${RETRY} 次失败: ${err.message}`);
        lastErr = err;
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
    if (!result) throw lastErr || new Error(`批 ${bi + 1} 生成失败`);

    if (isFirst && result.title) title = result.title;
    if (isLast && result.summary) summary = result.summary;

    const batchMissing = findMissingWords(batchContent, batchWords);
    // 检查翻译中夹杂的未译英文词（AI 偷懒的迹象），仅提示，不阻塞
    const untranslated = (batchTranslation.match(/[a-zA-Z][a-zA-Z']{3,}/g) || [])
      .filter(w => w !== w.toUpperCase() && !(w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase()));
    contentParts.push(batchContent);
    translationParts.push(batchTranslation);
    const untranslatedNote = untranslated.length > 0 ? `，⚠️ 译文夹杂 ${untranslated.length} 个未译英文词` : '';
    console.log(`  批 ${bi + 1}/${batches.length} 完成 (${batchContent.split(/\s+/).filter(Boolean).length} 词，本批缺 ${batchMissing.length} 词${untranslatedNote})`);

    if (!isLast) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // 章末统一补齐：将全章缺词收集起来，用承接主线续写一次性补
  const chapterTitle = title || `第 ${chapterIdx + 1} 章`;
  let remainingMissing = findMissingWords(contentParts.join('\n\n'), targetWords);
  if (remainingMissing.length > 0) {
    console.log(`  🔧 主体生成后共缺 ${remainingMissing.length} 词，开始续写补齐...`);
    // 每次补齐处理至多 60 词一批，避免单次 prompt 词太多
    const MAX_PATCH_ROUNDS = 3;
    for (let round = 1; round <= MAX_PATCH_ROUNDS && remainingMissing.length > 0; round++) {
      const roundWords = remainingMissing.slice(0, Math.min(60, remainingMissing.length));
      console.log(`    第 ${round} 轮补齐（本轮 ${roundWords.length} 词）: ${roundWords.slice(0, 5).join(', ')}${roundWords.length > 5 ? '...' : ''}`);
      try {
        const patchPrompt = buildPatchPrompt(roundWords, arc, chapterTitle, contentParts.join('\n\n'));
        const raw = await callAI(patchPrompt, SYSTEM_PROMPT);
        const patch = extractJson(raw);
        const patchContent = sanitizeContent(patch.content || '');
        const patchTranslation = sanitizeContent(patch.translation || '');
        contentParts.push(patchContent);
        translationParts.push(patchTranslation);
        // 重新扫描全章缺词
        remainingMissing = findMissingWords(contentParts.join('\n\n'), targetWords);
        console.log(`    第 ${round} 轮补齐后仍缺 ${remainingMissing.length} 词`);
      } catch (err) {
        console.log(`    第 ${round} 轮补齐失败: ${err.message}`);
        break;
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // 程序化清理：去除残留重复句、拆分超长段（60-90 词）、译文段锁步对齐
  const cleaned = processChapter({
    content: contentParts.join('\n\n'),
    translation: translationParts.join('\n\n'),
    words: targetWords,
  });
  const finalMissing = findMissingWords(cleaned.content, targetWords);
  const enP = cleaned.content.split(/\n\n+/).filter(Boolean).length;
  const zhP = cleaned.translation.split(/\n\n+/).filter(Boolean).length;
  console.log(`  📊 章末统计：${cleaned.word_count} 词，覆盖 ${targetWords.length - finalMissing.length}/${targetWords.length}${finalMissing.length > 0 ? `（仍缺 ${finalMissing.length}: ${finalMissing.slice(0, 10).join(', ')}${finalMissing.length > 10 ? '...' : ''}）` : '（全覆盖 ✅）'} | 段 ${enP}(en)/${zhP}(zh)${enP === zhP ? '' : ' ✗错位'} | 清理去重 ${cleaned.stats.dedupRemoved} 句`);

  return {
    title: chapterTitle,
    content: cleaned.content,
    translation: cleaned.translation,
    word_count: cleaned.word_count,
    summary,
    missingWords: finalMissing,
  };
}

/**
 * 读取现有的 stories.json（用于断点续传）。
 */
function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveStories(chapters, totalWords) {
  const out = {
    series_title: SERIES_TITLE,
    total_chapters: CHAPTERS,
    total_words: totalWords,
    chapters,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
}

async function main() {
  const words = loadWords();
  // 用固定 seed 确定性打乱，把 A-Z 各字母的词均匀混入每章。
  // 固定 seed 保证同一份词典每次运行分组一致，便于断点续传。
  const shuffled = shuffleDeterministic(words, 20260720);
  const chunks = chunkWords(shuffled, CHAPTERS);
  console.log(`🔀 已确定性打乱 ${words.length} 个单词，切分为 ${CHAPTERS} 组`);

  if (CHAPTER_IDS) {
    // 非连续原地重生成：仅替换 CHAPTER_IDS 指定的章节，保留其他章节
    const existing = loadExisting();
    const chapters =
      existing && Array.isArray(existing.chapters) ? existing.chapters.slice() : [];
    const ids = CHAPTER_IDS.slice().sort((a, b) => a - b);
    console.log(`📖 原地重生成章节：${ids.join(', ')}（其他章节保留不动）`);
    for (const id of ids) {
      if (id < 1 || id > CHAPTERS) {
        console.log(`  跳过非法章节号 ${id}`);
        continue;
      }
      const idx = id - 1;
      const arc = STORY_ARC[idx] || STORY_ARC[STORY_ARC.length - 1];
      const targetWords = chunks[idx];
      const prevChap = chapters.find((c) => c.id === id - 1);
      const prevSummary = (prevChap && prevChap.summary) || '';
      console.log(`\n=== 第 ${id}/${CHAPTERS} 章 (${arc.location} / ${arc.theme}) ===`);
      const result = await generateChapter(idx, arc, targetWords, prevSummary);
      const chapter = {
        id,
        title: result.title || `第 ${id} 章`,
        content: result.content,
        translation: result.translation,
        words: targetWords,
        word_count: result.word_count,
        theme: arc.theme,
      };
      if (result.summary) chapter.summary = result.summary;
      const replaceIdx = chapters.findIndex((c) => c.id === id);
      if (replaceIdx >= 0) chapters[replaceIdx] = chapter;
      else {
        chapters.push(chapter);
        chapters.sort((a, b) => a.id - b.id);
      }
      saveStories(chapters, words.length);
      console.log(`  💾 已保存到 ${path.relative(ROOT, OUT_PATH)} (${result.word_count} 词)`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    console.log(`\n🎉 章节重生成完成：${ids.join(', ')}`);
    return;
  }

  const endChapter = Math.min(MAX_CHAPTERS, CHAPTERS);
  console.log(`📖 计划：共 ${CHAPTERS} 章，每章约 ${chunks[0].length} 个目标词`);
  if (endChapter < CHAPTERS) {
    console.log(`   本次只生成第 ${START_CHAPTER}-${endChapter} 章（MAX_CHAPTERS=${MAX_CHAPTERS}）`);
  }

  // 断点续传：加载已有章节
  const existing = loadExisting();
  const chapters =
    existing && Array.isArray(existing.chapters) && START_CHAPTER > 1
      ? existing.chapters.filter((c) => c.id < START_CHAPTER)
      : [];

  let prevSummary = chapters.length > 0 ? chapters[chapters.length - 1].summary || '' : '';

  for (let i = START_CHAPTER - 1; i < endChapter; i++) {
    const arc = STORY_ARC[i] || STORY_ARC[STORY_ARC.length - 1];
    const targetWords = chunks[i];
    console.log(`\n=== 第 ${i + 1}/${CHAPTERS} 章 (${arc.location} / ${arc.theme}) ===`);

    const result = await generateChapter(i, arc, targetWords, prevSummary);
    const chapter = {
      id: i + 1,
      title: result.title || `第 ${i + 1} 章`,
      content: result.content,
      translation: result.translation,
      words: targetWords,
      word_count: result.word_count,
      theme: arc.theme,
    };
    if (result.summary) chapter.summary = result.summary;
    chapters.push(chapter);
    prevSummary = result.summary || '';

    // 每章生成后立即持久化，防止中断丢失
    saveStories(chapters, words.length);
    console.log(`  💾 已保存到 ${path.relative(ROOT, OUT_PATH)} (${result.word_count} 词)`);

    if (i < endChapter - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n🎉 第 ${START_CHAPTER}-${endChapter} 章生成完成！输出：${OUT_PATH}`);
}

main().catch((err) => {
  console.error('\n❌ 生成失败：', err);
  process.exit(1);
});
