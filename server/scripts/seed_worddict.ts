/**
 * 词库灌库脚本：从 src/data/worddict.json 读取 → 写入 word_dict_versions + word_dict_entries。
 *
 * 设计要点：
 * - 幂等：version 唯一约束 + word PK + upsert 模式，重复执行安全。
 * - 分批：4801 条一次性 $transaction 容易撞超时，分 500 条/批。
 * - 自动派生 etag：md5(version 字符串)，便于客户端 If-None-Match。
 *
 * 用法（从 server/ 目录跑）：
 *   npx tsx scripts/seed_worddict.ts
 *
 * 可选环境变量：
 *   WORDDICT_VERSION  自定义版本号字符串，默认 "v4801-<date>"
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

const BATCH_SIZE = 500;

type WordDictEntryJson = {
  definitions: Array<{
    part_of_speech: string;
    meaning: string;
    example?: string;
    is_core?: boolean;
    is_rare_sense?: boolean;
  }>;
  etymology?: string;
  similar_words?: Array<{ word: string; relation: 'spelling' | 'meaning' | 'root'; description: string }>;
  suggestedDifficulty?: number;
  examFrequency?: number;
  memoryTip?: string;
};

type WordDictJson = { results: Record<string, WordDictEntryJson> };

function loadWordDict(): WordDictJson {
  // server/ 目录的兄弟 ../src/data/worddict.json
  const file = path.resolve(__dirname, '../../src/data/worddict.json');
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw) as WordDictJson;
}

async function main() {
  const version = process.env.WORDDICT_VERSION ?? `v4801-${new Date().toISOString().slice(0, 10)}`;
  const etag = crypto.createHash('md5').update(version).digest('hex');
  const publishedAt = new Date();

  console.log(`[seed_worddict] 读取 worddict.json …`);
  const dict = loadWordDict();
  const entries = Object.entries(dict.results);
  const wordCount = entries.length;
  console.log(`[seed_worddict] 共 ${wordCount} 条词条`);

  // 1. upsert version
  const versionRow = await prisma.wordDictVersion.upsert({
    where: { version },
    create: { version, wordCount, etag, isCurrent: true, publishedAt },
    update: { wordCount, etag, isCurrent: true, publishedAt },
  });
  console.log(`[seed_worddict] version=${version} etag=${etag} id=${versionRow.id}`);

  // 2. 取消其他版本的 isCurrent
  await prisma.wordDictVersion.updateMany({
    where: { version: { not: version }, isCurrent: true },
    data: { isCurrent: false },
  });

  // 3. 分批 upsert 词条
  let done = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map(([word, entry]) =>
        prisma.wordDictEntry.upsert({
          where: { word },
          create: {
            word,
            versionId: versionRow.id,
            definitions: entry.definitions as unknown as object,
            etymology: entry.etymology,
            similarWords: (entry.similar_words ?? []) as unknown as object,
            suggestedDifficulty: entry.suggestedDifficulty,
            examFrequency: entry.examFrequency,
            memoryTip: entry.memoryTip,
          },
          update: {
            versionId: versionRow.id,
            definitions: entry.definitions as unknown as object,
            etymology: entry.etymology,
            similarWords: (entry.similar_words ?? []) as unknown as object,
            suggestedDifficulty: entry.suggestedDifficulty,
            examFrequency: entry.examFrequency,
            memoryTip: entry.memoryTip,
          },
        })
      )
    );
    done += batch.length;
    if (done % 2000 === 0 || done === wordCount) {
      console.log(`[seed_worddict] 进度 ${done}/${wordCount}`);
    }
  }

  console.log(`[seed_worddict] ✅ 完成：${wordCount} 条词条已写入`);
}

main()
  .catch((e) => {
    console.error('[seed_worddict] ❌ 失败', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
