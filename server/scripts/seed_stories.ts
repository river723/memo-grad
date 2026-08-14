/**
 * 系列故事灌库脚本：从 src/data/stories.json 读取 → 写入 stories + story_chapters。
 *
 * 设计要点：
 * - 幂等：series_title 唯一 + @@unique([storyId, chapterId]) + upsert。
 * - chapterId 保持数字（内容索引，非用户实体 ID），勿改 UUID。
 * - words 暂存 Json 数组（未来 worddict 后端化后改为 UUID 数组）。
 *
 * 用法（从 server/ 目录跑）：
 *   npx tsx scripts/seed_stories.ts
 */

import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

type StoryChapterJson = {
  id: number;
  title: string;
  content: string;
  translation: string;
  words: string[];
  word_count: number;
  theme: string;
  summary?: string;
};

type StoriesJson = {
  series_title: string;
  total_chapters: number;
  total_words: number;
  chapters: StoryChapterJson[];
};

function loadStories(): StoriesJson {
  const file = path.resolve(__dirname, '../../src/data/stories.json');
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw) as StoriesJson;
}

async function main() {
  console.log('[seed_stories] 读取 stories.json …');
  const data = loadStories();
  console.log(`[seed_stories] 系列「${data.series_title}」${data.chapters.length} 章`);

  // 1. upsert series（series_title 作业务锚点保证幂等）
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
  console.log(`[seed_stories] story id=${series.id}`);

  // 2. 逐章 upsert
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
    console.log(`[seed_stories] 第 ${ch.id} 章「${ch.title}」完成`);
  }

  const count = await prisma.storyChapter.count({ where: { storyId: series.id, deletedAt: null } });
  console.log(`[seed_stories] ✅ 完成：${count} 章已写入`);
}

main()
  .catch((e) => {
    console.error('[seed_stories] ❌ 失败', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
