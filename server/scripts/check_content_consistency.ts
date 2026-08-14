/**
 * 数据一致性抽查：DB 词条 vs 原 JSON，逐字段 byte-equal。
 * 跑法：npx tsx scripts/check_content_consistency.ts [word1 word2 ...]
 * 默认抽查 abandon / abdomen / diligent。
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const json = JSON.parse(readFileSync(path.resolve(__dirname, '../../src/data/worddict.json'), 'utf8'));
const words = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['abandon', 'abdomen', 'diligent'];

/**
 * 深比较（忽略对象 key 顺序）。
 * 注意不能直接用 JSON.stringify：Postgres jsonb 会重排 key 顺序，
 * 字符串化比较会误报不一致——内容本身是 byte-equal 的。
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

(async () => {
  let fail = 0;
  for (const w of words) {
    const row = await prisma.wordDictEntry.findUnique({ where: { word: w } });
    const j = json.results[w];
    if (!j) { console.log(`${w} ❌ JSON 无此词`); fail++; continue; }
    const ok =
      !!row &&
      deepEqual(row.definitions, j.definitions) &&
      deepEqual(row.similarWords, j.similar_words ?? []) &&
      row.memoryTip === (j.memoryTip ?? null) &&
      row.etymology === (j.etymology ?? null) &&
      row.suggestedDifficulty === (j.suggestedDifficulty ?? null) &&
      row.examFrequency === (j.examFrequency ?? null);
    console.log(`${w} ${ok ? '✅ 一致' : '❌ 不一致'}`);
    if (!ok) fail++;
  }
  console.log(fail === 0 ? '全部一致' : `${fail} 个不一致`);
  process.exit(fail === 0 ? 0 : 1);
})().finally(() => prisma.$disconnect());
