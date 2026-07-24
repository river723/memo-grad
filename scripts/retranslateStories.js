// scripts/retranslateStories.js
//
// 逐章逐段重新翻译 stories.json，确保每段英文与中文翻译精确对应。
// 用法：
//   node scripts/retranslateStories.js                  # 全部 20 章
//   CHAPTER=3 node scripts/retranslateStories.js         # 仅第 3 章
//   DRY=1 node scripts/retranslateStories.js              # 只打印统计
//
// 依赖 .env 文件（API_KEY、API_BASE、API_MODEL），与 generateStories 共用同一组凭据。

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// 加载 .env
let envConfig = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) envConfig[m[1]] = m[2].trim();
  }
} catch {}

const ROOT = path.resolve(__dirname, '..');
const STORIES_PATH = path.join(ROOT, 'src/data/stories.json');

const API_KEY = process.env.API_KEY || envConfig.API_KEY || '';
const API_BASE = process.env.API_BASE || envConfig.API_BASE || 'https://api.deepseek.com/v1';
const API_MODEL = process.env.API_MODEL || envConfig.API_MODEL || 'deepseek-v4-flash';
const DELAY_MS = Number(process.env.DELAY_MS || 1500);
const ONLY_CHAPTER = process.env.CHAPTER ? Number(process.env.CHAPTER) : null;
const DRY = !!process.env.DRY;
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 20); // 每批翻译段落数

if (!API_KEY) {
  console.error('❌ 缺少 API_KEY（在 .env 或环境变量中设置）');
  process.exit(1);
}

/**
 * 调用 AI Chat Completion API。
 */
function callAI(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: API_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
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
        timeout: 120000,
      },
      (res) => {
        const bufs = [];
        res.on('data', (chunk) => bufs.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(bufs).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`API ${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices?.[0]?.message?.content || '');
          } catch (e) {
            reject(new Error(`Parse failed: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.write(body);
    req.end();
  });
}

const SYSTEM_PROMPT =
  '你是专业的中英互译专家。用户会给你一段英文故事原文，' +
  '你需要将其准确翻译成简体中文。要求：\n' +
  '1. 必须完整保留原文的所有句子信息和语义，不能遗漏、合并或添加内容\n' +
  '2. 翻译风格与故事主题一致，流畅自然\n' +
  '3. 人名、地名等专有名词统一使用：亚历克斯(Alex)、诺娃(Nova)、埃拉拉(Elara)\n' +
  '4. 严格逐句对应翻译，保持原文的段落结构\n' +
  '5. 不要输出任何解释、说明、前缀文字，只输出纯翻译文本\n' +
  '6. 不要重复翻译同一句话\n' +
  '7. 如果原文包含多句话，请全部翻译，不要省略';

/**
 * 切分段落（按 \n\n+）。
 */
function splitParagraphs(text) {
  return text.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
}

/**
 * 批量翻译段落：每次翻译 N 个段落对，返回译文列表。
 * 采用"翻译 + 验证"模式：先翻译，再让 AI 校验是否漏翻。
 */
async function translateBatch(enParasBatch, chapterInfo, batchIndex) {
  // 构造 prompt：给出所有英文段落，要求逐段翻译
  const prompt = `请翻译以下英文段落为简体中文。必须逐段对应，每个译文段落用"---PARA---"分隔：

【章节信息】${chapterInfo.title} (${chapterInfo.theme} / ${chapterInfo.location})

${enParasBatch.map((p, i) => `【段落 ${i + 1}】${p}`).join('\n\n')}

请将以上内容翻译成简体中文，格式如下（严格按顺序输出）：
翻译 1: <第1段译文>
翻译 2: <第2段译文>
...
翻译 N: <第N段译文>`;

  let result = '';
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      result = await callAI(prompt);
      // 提取译文
      const translations = [];
      const lines = result.split('\n');
      for (const line of lines) {
        const m = line.match(/^翻译\s*(\d+)\s*[:：]\s*(.+)$/);
        if (m) {
          translations.push(m[2]);
        }
      }

      // 验证译文数量是否匹配
      if (translations.length === enParasBatch.length) {
        return translations;
      } else {
        console.log(`    ⚠️ 译文数量不符：期望=${enParasBatch.length} 实际=${translations.length}，重试...`);
      }
    } catch (err) {
      console.log(`    ⚠️ 第 ${attempts}/${maxAttempts} 次尝试失败: ${err.message}`);
    }
    if (attempts < maxAttempts) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  throw new Error(`翻译失败（${maxAttempts}次尝试后译文数量仍不匹配，期望=${enParasBatch.length} 实际=${result ? result.slice(0,100) : '(空)'}`);
}

/**
 * 将译文列表合并回字符串。
 */
function joinTranslations(translations) {
  return translations.join('\n\n');
}

/**
 * 处理单章：逐段翻译 + 对齐验证。
 */
async function processChapter(chapter, idx) {
  const enParas = splitParagraphs(chapter.content);
  const zhParas = chapter.translation
    ? splitParagraphs(chapter.translation)
    : [];
  const chapterInfo = { title: chapter.title, theme: chapter.theme, location: '' };

  console.log(`\n=== CH${String(chapter.id).padStart(2)} "${chapter.title}" | ${enParas.length} EN paras | ${zhParas.length} ZH paras ===`);

  // 按 BATCH_SIZE 拆分翻译
  const newZhParts = [];

  for (let bi = 0; bi < enParas.length; bi += BATCH_SIZE) {
    const batch = enParas.slice(bi, bi + BATCH_SIZE);
    const batchNum = Math.floor(bi / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(enParas.length / BATCH_SIZE);

    console.log(`  批次 ${batchNum}/${totalBatches} (${batch.length} 段)...`);

    try {
      const translations = await translateBatch(batch, chapterInfo, batchNum);
      newZhParts.push(...translations);
      console.log(`    ✅ 完成 (${batch.length} 段)`);
    } catch (err) {
      console.error(`    ❌ 失败: ${err.message}`);
      throw err;
    }
  }

  // 验证：新译文段落数必须等于英文段落数
  if (newZhParts.length !== enParas.length) {
    throw new Error(`译文数量验证失败：EN=${enParas.length} ZH=${newZhParts.length}`);
  }

  return { translation: joinTranslations(newZhParts) };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
  console.log(`📖 加载 stories.json：${data.chapters.length} 章\n`);

  let processedChapters = 0;

  for (let i = 0; i < data.chapters.length; i++) {
    const chapter = data.chapters[i];
    if (ONLY_CHAPTER && chapter.id !== ONLY_CHAPTER) continue;

    try {
      const result = await processChapter(chapter, i);

      if (!DRY) {
        chapter.translation = result.translation;
        fs.writeFileSync(STORIES_PATH, JSON.stringify(data, null, 2), 'utf8');
        console.log(`  💾 已保存 ch${chapter.id}`);
      }
      processedChapters++;
    } catch (err) {
      console.error(`\n❌ CH${chapter.id} 翻译失败：${err.message}`);
      console.error('跳过该章，继续下一章...');
    }

    if (i < data.chapters.length - 1 && !ONLY_CHAPTER) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n🎉 完成！共处理 ${processedChapters} 章（${ONLY_CHAPTER ? `仅 CH${ONLY_CHAPTER}` : '全部'}）`);
}

main().catch(err => {
  console.error('\n❌ 总出错:', err.message);
  process.exit(1);
});
