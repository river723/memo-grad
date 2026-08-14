/**
 * 系列故事「生成 → 写库」串联脚本。
 *
 * 设计意图（对应 stories 迁移方案 S3）：
 * - generateStories.js 保持原样（仍写 src/data/stories.json，不污染老脚本）
 * - 本脚本负责第二步：把生成/重生成后的 stories.json upsert 进 story 表
 * - 与 seed_stories.ts 的写入逻辑一致，只是挂在「生成之后」自动跑
 *
 * 用法（从 server/ 目录跑）：
 *   npx tsx scripts/generateStoriesToDb.ts [--no-gen] [generator 参数...]
 *
 * 参数透传给 ../scripts/generateStories.js（如 CHAPTER_IDS=1,6 环境变量）；
 * --no-gen 跳过生成步骤，只做灌库（等价于 seed_stories.ts）。
 */

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

const NO_GEN = process.argv.includes('--no-gen');
const GENERATOR = path.resolve(__dirname, '../scripts/generateStories.js');
const STORIES_JSON = path.resolve(__dirname, '../../src/data/stories.json');

type StoryChapterJson = {
  id: number;
  title: string;
  content: string;
  translation: string;
  words: string[];
  word_count: number;
  theme: string;
};

type StoriesJson = {
  series_title: string;
  total_chapters: number;
  total_words: number;
  chapters: StoryChapterJson[];
};

async function upsertStories(): Promise<void> {
  const data = JSON.parse(readFileSync(STORIES_JSON, 'utf8')) as StoriesJson;
  const series = await prisma.story.upsert({
    where: { seriesTitle: data.series_title },
    create: {
      seriesTitle: data.series_title,
      totalWords: data.total_words,
      totalChapters: data.chapters.length,
    },
    update: {
      totalWords: data.total_words,
      totalChapters: data.chapters.length,
    },
  });

  for (const ch of data.chapters) {
    await prisma.storyChapter.upsert({
      where: { storyId_chapterId: { storyId: series.id, chapterId: ch.id } },
      create: {
        storyId: series.id,
        chapterId: ch.id,
        title: ch.title,
        content: ch.content,
        translation: ch.translation,
        words: ch.words as unknown as object,
        wordCount: ch.word_count,
        theme: ch.theme,
      },
      update: {
        title: ch.title,
        content: ch.content,
        translation: ch.translation,
        words: ch.words as unknown as object,
        wordCount: ch.word_count,
        theme: ch.theme,
      },
    });
    console.log(`[generateStoriesToDb] 第 ${ch.id} 章「${ch.title}」已写库`);
  }
  console.log(`[generateStoriesToDb] ✅ 全部章节已写库（story id=${series.id}）`);
}

async function main() {
  if (!NO_GEN) {
    console.log('[generateStoriesToDb] 第 1 步：运行 generateStories.js …');
    execFileSync('node', [GENERATOR, ...process.argv.slice(2).filter((a) => a !== '--no-gen')], {
      stdio: 'inherit',
      env: process.env,
    });
  } else {
    console.log('[generateStoriesToDb] --no-gen：跳过生成，直接灌库');
  }

  console.log('[generateStoriesToDb] 第 2 步：upsert stories.json → DB …');
  await upsertStories();
}

main()
  .catch((e) => {
    console.error('[generateStoriesToDb] ❌ 失败', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
