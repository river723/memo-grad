// scripts/fixMixedTranslations.js
//
// 修复 src/data/stories.json 中翻译懒惰的问题：
// 部分章节的中文翻译里夹杂了未翻译的英文目标词（AI 偷懒）。
// 策略：找出含≥1 个英文单词（长度 ≥3）的中文段落，把该段的英文原文一起给 AI，
//       让它重新翻译该段，输出纯中文（保留必要的人名、书名号等）。
//
// 用法：
//   node scripts/fixMixedTranslations.js
//   CHAPTER=4 node scripts/fixMixedTranslations.js   # 只修某一章

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const STORIES_PATH = path.join(ROOT, 'src/data/stories.json');

const API_KEY = process.env.API_KEY || '';
const API_BASE = process.env.API_BASE || 'https://api.deepseek.com/v1';
const API_MODEL = process.env.API_MODEL || 'deepseek-chat';
const DELAY_MS = Number(process.env.DELAY_MS || 1000);
const ONLY_CHAPTER = process.env.CHAPTER ? Number(process.env.CHAPTER) : null;

/**
 * 判断段落是否含有夹杂的英文单词（≥3 字符），
 * 排除常见"合理"出现：大写缩写、单个大写词=人名、引号包围的英文引用。
 */
function hasMixedEnglish(paragraph) {
  // 先移除引号（含全角单双引号）包围的英文引用，这些是合理引用
  let cleaned = paragraph
    .replace(/['""‘’“”「『」』][a-zA-Z][a-zA-Z']*['""‘’“”」』」』]/g, '');

  const words = cleaned.match(/[a-zA-Z][a-zA-Z']{2,}/g) || [];
  if (words.length === 0) return false;

  for (const w of words) {
    if (w === w.toUpperCase()) continue; // 全大写缩写
    if (w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase()) continue; // 人名/地名
    return true; // 需要翻译
  }
  return false;
}

function callAI(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: API_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
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
        timeout: 90000,
      },
      (res) => {
        const bufs = [];
        res.on('data', (chunk) => bufs.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(bufs).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data).choices[0].message.content);
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
  '你是一位精通中英文的翻译专家。用户会给你一段英文原文，' +
  '和一段中文译文——但译文里有些英文词没有被翻译，直接夹在中文里。' +
  '你的任务是重新翻译这段中文，把夹杂的英文词全部译成流畅自然的中文。' +
  '要求：\n' +
  '1. 保留原译文的中文措辞和风格，只替换英文夹杂词为对应中文\n' +
  '2. 人名（如 Alex、Elara、Vance、Iris、Nova）可以保留英文形式或音译（保持一致即可）\n' +
  '3. 输出只包含译文本身，不要任何前缀、解释、引号';

async function fixParagraph(englishFullChapter, badChinese) {
  const prompt = `【英文原文（章节全文，供上下文参考）】
${englishFullChapter.slice(0, 4000)}

【需要修复的中文译文段落】（其中夹杂了未翻译的英文词，请全部翻译成中文）
${badChinese}

请输出修复后的中文段落，不要任何前缀、解释或引号。人名（Alex/Elara/Vance/Iris/Nova 等）可保留英文。`;

  const raw = await callAI(prompt, SYSTEM_PROMPT);
  let answer = raw.trim();
  // 剥掉可能的引号
  answer = answer.replace(/^["""'']+/, '').replace(/["""'']+$/, '');
  // 剥掉可能的 markdown 标记
  answer = answer.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
  return answer.trim();
}

async function fixChapter(chapter) {
  const paras = chapter.translation.split(/\n\n+/);
  const badParaIndices = [];
  paras.forEach((p, i) => {
    if (hasMixedEnglish(p)) badParaIndices.push(i);
  });

  if (badParaIndices.length === 0) return { fixed: 0, failed: 0 };

  console.log(`  第 ${chapter.id} 章：${badParaIndices.length} 段需要修复`);
  let fixed = 0;
  let failed = 0;

  for (const idx of badParaIndices) {
    const badPara = paras[idx];
    try {
      const newPara = await fixParagraph(chapter.content, badPara);
      // 简单验证：新段应更少英文夹杂
      if (newPara && !hasMixedEnglish(newPara)) {
        paras[idx] = newPara;
        fixed++;
        process.stdout.write('.');
      } else if (newPara && (newPara.match(/[a-z]/g) || []).length < (badPara.match(/[a-z]/g) || []).length / 2) {
        // 兜底：英文含量减少一半以上也算成功
        paras[idx] = newPara;
        fixed++;
        process.stdout.write('~');
      } else {
        failed++;
        process.stdout.write('x');
      }
    } catch (err) {
      failed++;
      process.stdout.write('!');
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log();

  chapter.translation = paras.join('\n\n');
  return { fixed, failed };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
  console.log(`📖 加载 stories.json：${data.chapters.length} 章`);

  let totalFixed = 0;
  let totalFailed = 0;
  for (const chapter of data.chapters) {
    if (ONLY_CHAPTER && chapter.id !== ONLY_CHAPTER) continue;

    const result = await fixChapter(chapter);
    if (result.fixed > 0 || result.failed > 0) {
      console.log(`  ✅ 修复 ${result.fixed} 段，失败 ${result.failed} 段`);
      // 立即保存
      fs.writeFileSync(STORIES_PATH, JSON.stringify(data, null, 2), 'utf8');
    }
    totalFixed += result.fixed;
    totalFailed += result.failed;
  }

  console.log(`\n🎉 全部完成：共修复 ${totalFixed} 段，失败 ${totalFailed} 段`);
  if (totalFailed > 0) console.log('⚠️  失败的段落仍含英文夹杂，可重跑此脚本或手动修改');
}

main().catch((err) => {
  console.error('❌ 出错：', err);
  process.exit(1);
});
