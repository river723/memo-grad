/**
 * 故事数据一致性抽查：DB 章节 vs 原 JSON，逐字段深比较（jsonb 会重排 key）。
 * 跑法：npx tsx scripts/check_stories_consistency.ts [chapterId...]
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const json = JSON.parse(readFileSync(path.resolve(__dirname, '../../src/data/stories.json'), 'utf8'));
const ids = process.argv.slice(2).map(Number);
const chapters = ids.length > 0 ? ids : [1, 10, 20];

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
  const series = await prisma.story.findFirst();
  if (!series) { console.log('❌ 无 story 行'); process.exit(1); }
  let fail = 0;
  for (const id of chapters) {
    const row = await prisma.storyChapter.findUnique({
      where: { storyId_chapterId: { storyId: series.id, chapterId: id } },
    });
    const j = json.chapters.find((c: { id: number }) => c.id === id);
    if (!j) { console.log(`第 ${id} 章 ❌ JSON 无此章`); fail++; continue; }
    const ok =
      !!row &&
      row.title === j.title &&
      row.content === j.content &&
      row.translation === j.translation &&
      deepEqual(row.words, j.words) &&
      row.wordCount === j.word_count &&
      row.theme === j.theme;
    console.log(`第 ${id} 章「${j.title}」 ${ok ? '✅ 一致' : '❌ 不一致'}`);
    if (!ok) fail++;
  }
  console.log(fail === 0 ? '全部一致' : `${fail} 个不一致`);
  process.exit(fail === 0 ? 0 : 1);
})().finally(() => prisma.$disconnect());
