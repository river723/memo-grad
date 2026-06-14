// scripts/build-wordbank.js
//
// 从 ECDICT (https://github.com/skywind3000/ECDICT, MIT License) 拉取
// ecdict.csv，筛出考研词条 (tag 含 "ky")，重塑为符合 src/types/index.ts
// 中 Word/WordDefinition 类型的 JSON，输出到 src/data/wordbank.json。
//
// 用法：
//   node scripts/build-wordbank.js          # 增量：缓存 csv 已存在则跳过下载
//   node scripts/build-wordbank.js --refresh  # 强制重新下载 csv
//   node scripts/build-wordbank.js --pretty   # 调试：输出带换行的 JSON
//
// 不引入 npm 依赖，只用 Node 内置模块。

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'scripts', 'raw');
const CSV_PATH = path.join(RAW_DIR, 'ecdict.csv');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'wordbank.json');
const SOURCE_URL =
  'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';

const args = new Set(process.argv.slice(2));
const FORCE_REFRESH = args.has('--refresh');
const PRETTY = args.has('--pretty');

// ----------------------------------------------------------------------------
// 1. 下载 CSV (流式，跟随 30x)

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part';
    const file = fs.createWriteStream(tmp);
    let received = 0;
    let total = 0;

    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(tmp, () => {});
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(tmp, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      total = parseInt(res.headers['content-length'] || '0', 10);
      let lastLog = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastLog > 500) {
          lastLog = now;
          const pct = total ? ((received / total) * 100).toFixed(1) : '?';
          process.stdout.write(
            `\r  downloading ecdict.csv: ${(received / 1024 / 1024).toFixed(1)} MB` +
              (total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB (${pct}%)` : '')
          );
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          process.stdout.write('\n');
          resolve();
        });
      });
    });
    req.on('error', (err) => {
      file.close();
      fs.unlink(tmp, () => {});
      reject(err);
    });
  });
}

async function ensureCsv() {
  if (!FORCE_REFRESH && fs.existsSync(CSV_PATH)) {
    const sz = fs.statSync(CSV_PATH).size;
    console.log(`✓ using cached ${path.relative(ROOT, CSV_PATH)} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
    return;
  }
  console.log(`↓ fetching ${SOURCE_URL}`);
  await download(SOURCE_URL, CSV_PATH);
}

// ----------------------------------------------------------------------------
// 2. 流式 CSV 解析 (RFC 4180 子集 — ECDICT 用标准引号转义；字段内 \n 已编码为 \\n)

const HEADER_FIELDS = [
  'word', 'phonetic', 'definition', 'translation', 'pos',
  'collins', 'oxford', 'tag', 'bnc', 'frq', 'exchange', 'detail', 'audio',
];

function* parseCsvLines(rl) {
  // 状态机式跨行解析：累积直到引号配对再产出一行
  let buf = '';
  let inQuote = false;

  function isComplete(s) {
    // 行末是否处于引号闭合状态：扫一遍数引号
    let q = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '"') q++;
    }
    return q % 2 === 0;
  }

  for (const line of rl) {
    if (buf === '' && isComplete(line)) {
      yield line;
    } else {
      buf += (buf ? '\n' : '') + line;
      if (isComplete(buf)) {
        yield buf;
        buf = '';
      }
    }
  }
  if (buf) yield buf;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') { inQuote = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

// ----------------------------------------------------------------------------
// 3. 字段重塑

const POS_PREFIX_RE = /^([a-z]+)\.\s*/i;
// 跳过纯学科 / 元数据释义：[计]/[医]/[法]/[化]/[经]/[机]/[电]/[建]、动词时态说明等
const SKIP_LINE_RE =
  /^\[(计|医|法|化|经|机|电|建|生|动|植|物|数|心|地|气|海|天|矿|食|纺|核|军|林|农|船)\]|的(过去式|过去分词|现在分词|复数形式|第三人称)/;

function buildDefinitions(translation, posField) {
  const lines = (translation || '')
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !SKIP_LINE_RE.test(s));

  if (!lines.length) return [];

  // 选 pos 字段中占比最大的词性，作为 fallback 词性
  let fallbackPos = 'unknown';
  if (posField) {
    let best = -1;
    for (const part of posField.split('/')) {
      const m = part.match(/^([a-z]+):(\d+)/i);
      if (m && +m[2] > best) { best = +m[2]; fallbackPos = m[1] + '.'; }
    }
  }

  const defs = lines.map((line) => {
    const m = line.match(POS_PREFIX_RE);
    if (m) {
      return {
        part_of_speech: (m[1] + '.').toLowerCase(),
        meaning: line.slice(m[0].length).trim(),
      };
    }
    return { part_of_speech: fallbackPos, meaning: line };
  });

  return defs;
}

function bnc2frequency(bnc) {
  // 高频词频率 3 / 中频 2 / 低频 1，对齐 PDF 三档
  const n = parseInt(bnc, 10);
  if (!n || n <= 0) return 1;
  if (n <= 2000) return 3;
  if (n <= 5000) return 2;
  return 1;
}

function difficultyOf(collins, bnc) {
  // collins 5★=最常用, 1★=最不常用。考研词的 collins 大多落在 1-3 之间，
  // 直接 6-c 会把绝大多数词打到 4-5（最难），失去区分度。映射到 2-4 中段：
  const c = parseInt(collins, 10);
  if (c >= 4) return 2;       // 4-5★ → 较易
  if (c === 3) return 3;      // 3★   → 中等
  if (c === 1 || c === 2) return 4; // 1-2★ → 较难
  // 无 collins 时按 BNC 词频回退
  const n = parseInt(bnc, 10);
  if (!n || n <= 0) return 4;
  if (n <= 3000) return 2;
  if (n <= 10000) return 3;
  return 4;
}

function reshape(row) {
  const rawWord = (row.word || '').trim();
  if (!rawWord || /\s/.test(rawWord) || rawWord.length > 30) return null;
  // 全大写但不是专有名词 (Christ/God/Latin/Pole/Polish 等大写有意义) — 全大写转小写：
  // 处理 CORE/FAX/TV 这种本应是普通词的条目
  let word = rawWord;
  if (/^[A-Z]+$/.test(rawWord) && rawWord.length > 1) {
    word = rawWord.toLowerCase();
  }

  const tags = (row.tag || '').split(/\s+/).filter(Boolean);
  if (!tags.includes('ky')) return null;

  let definitions = buildDefinitions(row.translation, row.pos);
  if (!definitions.length && row.definition) {
    // 译文缺失时退回英文释义
    definitions = buildDefinitions(row.definition, row.pos);
  }
  if (!definitions.length) return null;

  const phonetic = (row.phonetic || '').trim();

  return {
    word,
    pronunciation_uk: phonetic || undefined,
    pronunciation_us: phonetic || undefined,
    definitions,
    similar_words: [],
    difficulty: difficultyOf(row.collins, row.bnc),
    frequency: bnc2frequency(row.bnc),
  };
}

// ----------------------------------------------------------------------------
// 4. 主流程

async function main() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  await ensureCsv();

  console.log(`▸ parsing ${path.relative(ROOT, CSV_PATH)} ...`);
  const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header = null;
  let total = 0;
  let kept = [];
  let unknownPos = 0;
  const freqBucket = { 1: 0, 2: 0, 3: 0 };

  // readline 是 async iterator
  const lines = [];
  for await (const line of rl) lines.push(line);

  for (const raw of parseCsvLines(lines)) {
    const fields = splitCsvLine(raw);
    if (!header) {
      header = fields;
      // sanity: ECDICT 列数固定
      if (header.length !== HEADER_FIELDS.length) {
        console.warn(`! header has ${header.length} cols (expected ${HEADER_FIELDS.length})`);
      }
      continue;
    }
    total++;
    if (fields.length < HEADER_FIELDS.length) continue;
    const row = {};
    for (let i = 0; i < HEADER_FIELDS.length; i++) row[HEADER_FIELDS[i]] = fields[i];

    const w = reshape(row);
    if (!w) continue;
    kept.push(w);
    freqBucket[w.frequency] = (freqBucket[w.frequency] || 0) + 1;
    if (w.definitions.some((d) => d.part_of_speech === 'unknown')) unknownPos++;
  }

  // 按字母排序 (大小写不敏感)，保证可重复
  kept.sort((a, b) => {
    const x = a.word.toLowerCase(), y = b.word.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });

  // 输出：每条占一行，便于 git diff
  let json;
  if (PRETTY) {
    json = JSON.stringify(kept, null, 2);
  } else {
    json = '[\n' + kept.map((w) => '  ' + JSON.stringify(w)).join(',\n') + '\n]\n';
  }
  fs.writeFileSync(OUT_PATH, json);

  const outSize = fs.statSync(OUT_PATH).size;
  console.log('');
  console.log(`✓ wrote ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`  source rows : ${total}`);
  console.log(`  kept (ky)   : ${kept.length}`);
  console.log(`  size        : ${(outSize / 1024).toFixed(1)} KB`);
  console.log(`  freq buckets: high=${freqBucket[3]}  mid=${freqBucket[2]}  low=${freqBucket[1]}`);
  console.log(`  unknown pos : ${unknownPos} entries (${((unknownPos / kept.length) * 100).toFixed(1)}%)`);
  if (kept[0]) {
    console.log(`  first entry : ${JSON.stringify(kept[0])}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
