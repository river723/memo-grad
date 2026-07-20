// scripts/fixStoryTranslations.js
//
// 修复 src/data/stories.json 中因 HTTP chunk 编码 bug 造成的中文翻译 U+FFFD 缺字。
// 每个坏点是 1 个中文字被替换成 3 个连续 �（对应 UTF-8 三字节被逐字节替换）。
// 策略：对每处 ��� 出现的位置，取前后各 40 字符的中文上下文 + 全章英文，
//       让 AI 只返回被替换的那 1 个中文字。
//
// 用法：
//   node scripts/fixStoryTranslations.js
//   CHAPTER=5 node scripts/fixStoryTranslations.js   # 只修某一章

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

const REPLACEMENT = '�';

function callAI(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: API_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
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
        timeout: 60000,
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

/**
 * 找出文本中所有连续的 REPLACEMENT 段（≥1 个连续 �）。
 * 返回 [{start, end, length}]，end 是 exclusive。
 */
function findReplacementSpans(text) {
  const spans = [];
  const re = new RegExp(REPLACEMENT + '+', 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, length: m[0].length });
  }
  return spans;
}

const SYSTEM_PROMPT =
  '你是一位精通中英文的翻译专家。用户会给你一段有缺字的中文译文（缺字位置用 [MISSING] 标记），' +
  '以及对应的英文原文。你的任务是根据上下文和英文原文，推断出 [MISSING] 位置应该填入的 1 到 3 个字符（可能是中文字，也可能是中文标点如 。，：；！？——）。' +
  '严格只输出应该填入的字符，不要任何英文标点、引号、解释、括号、前缀，也不要输出 [MISSING] 前后的字。' +
  '如果实在无法推断，输出一个下划线 _。';

/**
 * 对单处替换段构造 prompt，让 AI 返回被替换处的中文字。
 */
async function fixOneSpan(fullChinese, span, englishHint) {
  const CTX = 80;
  const before = fullChinese.slice(Math.max(0, span.start - CTX), span.start);
  const after = fullChinese.slice(span.end, span.end + CTX);

  const prompt = `以下中文段落中的 [MISSING] 位置有 1-3 个字符丢失（可能是中文字，也可能是全角标点如 。，：；），请根据上下文和英文原文推断出应该填入的字符。

【中文段落】
${before}[MISSING]${after}

【英文原文全段（供推断参考）】
${englishHint}

请只输出应该填入 [MISSING] 位置的字符（1-3 个中文字或中文标点），不要输出上下文、不要英文标点、不要解释、不要引号、不要括号。示例格式：一 或 至少 或 空 或 。 或 ：`;

  const raw = await callAI(prompt, SYSTEM_PROMPT);
  // 清理 AI 回答
  let answer = raw.trim();
  // 剥掉英文引号和外层空白
  answer = answer.replace(/^["'`\s]+/, '').replace(/["'`\s]+$/, '');
  // 拒绝：包含英文字母、包含 U+FFFD、太长（>6 字符）
  if (!answer || answer.length > 6) return null;
  if (/[a-zA-Z]/.test(answer)) return null;
  if (answer.includes(REPLACEMENT)) return null;
  if (answer === '_' || answer === '？' || answer === '?') return null;
  // 只保留中文字符及中文标点（剔除 AI 可能返回的多余英文标点或序号）
  //   一-鿿  CJK 统一汉字
  //   㐀-䶿  CJK 扩展 A
  //   　-〿  CJK 符号和标点（。、，：；「」『』）
  //   ＀-￯  全角 ASCII（！？（）—— 等）
  const cjkMatch = answer.match(/[一-鿿㐀-䶿　-〿＀-￯]+/g);
  if (!cjkMatch) return null;
  return cjkMatch.join('');
}

/**
 * 修复一章的翻译（中文文本）。
 */
async function fixChapterTranslation(chapter) {
  const chinese = chapter.translation;
  const english = chapter.content;
  const spans = findReplacementSpans(chinese);
  if (spans.length === 0) return { fixed: 0, failed: 0, newTrans: chinese };

  console.log(`  第 ${chapter.id} 章：${spans.length} 处需要修复`);

  // 从后往前替换，避免下标变化
  let newTrans = chinese;
  let fixed = 0;
  let failed = 0;
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    // 用当前 newTrans 的对应位置构造上下文（因为前面的修复不影响后面的 span）
    try {
      const replacement = await fixOneSpan(newTrans, span, english);
      if (replacement && !replacement.includes(REPLACEMENT)) {
        newTrans = newTrans.slice(0, span.start) + replacement + newTrans.slice(span.end);
        fixed++;
        process.stdout.write('.');
      } else {
        failed++;
        process.stdout.write('x');
      }
    } catch (err) {
      failed++;
      process.stdout.write('!');
    }
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log();
  return { fixed, failed, newTrans };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
  console.log(`📖 加载 stories.json：${data.chapters.length} 章`);

  let totalFixed = 0;
  let totalFailed = 0;
  for (const chapter of data.chapters) {
    if (ONLY_CHAPTER && chapter.id !== ONLY_CHAPTER) continue;

    const result = await fixChapterTranslation(chapter);
    if (result.fixed > 0 || result.failed > 0) {
      console.log(`  ✅ 修复 ${result.fixed} 处，失败 ${result.failed} 处`);
      chapter.translation = result.newTrans;
      // 每章修完立即保存
      fs.writeFileSync(STORIES_PATH, JSON.stringify(data, null, 2), 'utf8');
    }
    totalFixed += result.fixed;
    totalFailed += result.failed;
  }

  console.log(`\n🎉 全部完成：共修复 ${totalFixed} 处，失败 ${totalFailed} 处`);
  if (totalFailed > 0) {
    console.log('⚠️  失败的位置仍显示为 �，可手动修改或重跑此脚本');
  }
}

main().catch((err) => {
  console.error('❌ 出错：', err);
  process.exit(1);
});
