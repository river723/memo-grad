/**
 * 真题灌库脚本：从 src/data/realExams.json 读取 → 写入 real_exam_* 表。
 *
 * 设计要点：
 * - 幂等：RealExamPaper 的 @@unique([year, setId]) + 各子表的 @unique paperId + upsert。
 * - paperId 稳定性：这是 RealExamWrongQuestion.questionId 引用的业务主键。
 *   灌库前先跑 format 校验（正则锁住格式），灌库后核对总数，任一不一致即 fail。
 * - 字段镜像：所有 Json 字段（questions/blanks/paragraphs/items/parts）原样存，
 *   不在 service 层重映射——前端消费形态就是 JSON 里的形态。
 *
 * 用法（从 server/ 目录跑）：
 *   npx tsx scripts/seed_real_exams.ts
 *   加 --dry-run 只做校验不写库。
 */

import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

type ReadingQuestion = { id: string; stem: string; options: string[]; answer: string; explanation?: string };
type ReadingPassage = {
  id: string;
  title: string;
  passage: string;
  questions: ReadingQuestion[];
  paragraphs: Array<{ en: string; zh: string }>;
};
type ClozeBlank = { index: number; options: string[]; answer: string; explanation?: string };
type ClozePaper = {
  id: string;
  passage: string;
  blanks: ClozeBlank[];
  paragraphs: Array<{ en: string; zh: string }>;
};
type NewTypePaper = {
  id: string;
  subtype: string;
  direction: string;
  options: Array<{ letter: string; text: string }>;
  questions: Array<{ index: number; answer: string; explanation?: string }>;
};
type TranslationPaper = {
  id: string;
  subtype: string;
  direction: string;
  passage: string;
  items: Array<{ index: number; en: string; zh: string }>;
};
type WritingPaper = { id: string; parts: unknown[] };
type YearSet = {
  reading: ReadingPassage[];
  cloze: ClozePaper;
  newType: NewTypePaper;
  translation: TranslationPaper;
  writing: WritingPaper;
};
type RealExamJson = Array<{ year: number; english1: YearSet; english2: YearSet }>;

/** paperId 格式锁：2023-e1-text1 / 2023-e1-cloze / 2023-e1-newtype / 2023-e1-translation / 2023-e1-writing */
const PAPER_ID_RE = /^\d{4}-e[12]-(text[1-4]|cloze|newtype|translation|writing)$/;
/** questionId 格式锁：2023-e1-text1-q21 */
const QUESTION_ID_RE = /^\d{4}-e[12]-text[1-4]-q\d+$/;

function loadRealExams(): RealExamJson {
  const file = path.resolve(__dirname, '../../src/data/realExams.json');
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw) as RealExamJson;
}

/** 收集 JSON 里所有 paperId 并校验格式。返回 paperId 集合。 */
function validatePaperIds(data: RealExamJson): Set<string> {
  const paperIds = new Set<string>();
  const bad: string[] = [];

  for (const y of data) {
    for (const setId of ['english1', 'english2'] as const) {
      const set = y[setId];
      for (const p of set.reading) {
        if (!PAPER_ID_RE.test(p.id)) bad.push(p.id);
        paperIds.add(p.id);
        for (const q of p.questions) {
          if (!QUESTION_ID_RE.test(q.id)) bad.push(q.id);
        }
      }
      for (const key of ['cloze', 'newType', 'translation', 'writing'] as const) {
        const paper = set[key] as { id: string } | undefined;
        if (!paper) continue;
        if (!PAPER_ID_RE.test(paper.id)) bad.push(paper.id);
        paperIds.add(paper.id);
      }
    }
  }

  if (bad.length > 0) {
    console.error(`[seed_real_exams] ❌ ${bad.length} 个 paperId/questionId 格式异常：`);
    for (const id of bad.slice(0, 20)) console.error(`  - ${id}`);
    process.exit(1);
  }
  return paperIds;
}

async function main() {
  console.log('[seed_real_exams] 读取 realExams.json …');
  const data = loadRealExams();
  console.log(`[seed_real_exams] ${data.length} 个年份`);

  // 1. 灌库前格式校验（防 paperId 漂移导致历史错题失配）
  const expectedPaperIds = validatePaperIds(data);
  console.log(`[seed_real_exams] 校验通过：${expectedPaperIds.size} 个 paperId 格式合法`);

  if (DRY_RUN) {
    console.log('[seed_real_exams] --dry-run 模式，不写库。');
    return;
  }

  // 2. 逐年份 upsert
  for (const y of data) {
    for (const setId of ['english1', 'english2'] as const) {
      const set = y[setId];
      const paperIds = [
        ...set.reading.map((p) => p.id),
        set.cloze?.id,
        set.newType?.id,
        set.translation?.id,
        set.writing?.id,
      ].filter((x): x is string => !!x);

      const paper = await prisma.realExamPaper.upsert({
        where: { year_setId: { year: y.year, setId } },
        create: { year: y.year, setId, paperIds },
        update: { paperIds },
      });

      for (const [i, passage] of set.reading.entries()) {
        await prisma.realExamPassage.upsert({
          where: { paperId: passage.id },
          create: {
            paperId: passage.id,
            paperRefId: paper.id,
            passageKey: `text${i + 1}`,
            title: passage.title,
            passage: passage.passage,
            paragraphs: passage.paragraphs as unknown as object,
            questions: passage.questions as unknown as object,
          },
          update: {
            title: passage.title,
            passage: passage.passage,
            paragraphs: passage.paragraphs as unknown as object,
            questions: passage.questions as unknown as object,
          },
        });
      }

      if (set.cloze) {
        await prisma.realExamCloze.upsert({
          where: { paperId: set.cloze.id },
          create: {
            paperId: set.cloze.id,
            paperRefId: paper.id,
            passage: set.cloze.passage,
            paragraphs: set.cloze.paragraphs as unknown as object,
            blanks: set.cloze.blanks as unknown as object,
          },
          update: {
            passage: set.cloze.passage,
            paragraphs: set.cloze.paragraphs as unknown as object,
            blanks: set.cloze.blanks as unknown as object,
          },
        });
      }

      if (set.newType) {
        await prisma.realExamNewType.upsert({
          where: { paperId: set.newType.id },
          create: {
            paperId: set.newType.id,
            paperRefId: paper.id,
            subtype: set.newType.subtype,
            direction: set.newType.direction,
            options: set.newType.options as unknown as object,
            questions: set.newType.questions as unknown as object,
          },
          update: {
            subtype: set.newType.subtype,
            direction: set.newType.direction,
            options: set.newType.options as unknown as object,
            questions: set.newType.questions as unknown as object,
          },
        });
      }

      if (set.translation) {
        await prisma.realExamTranslation.upsert({
          where: { paperId: set.translation.id },
          create: {
            paperId: set.translation.id,
            paperRefId: paper.id,
            subtype: set.translation.subtype,
            direction: set.translation.direction,
            passage: set.translation.passage,
            items: set.translation.items as unknown as object,
          },
          update: {
            subtype: set.translation.subtype,
            direction: set.translation.direction,
            passage: set.translation.passage,
            items: set.translation.items as unknown as object,
          },
        });
      }

      if (set.writing) {
        await prisma.realExamWriting.upsert({
          where: { paperId: set.writing.id },
          create: {
            paperId: set.writing.id,
            paperRefId: paper.id,
            parts: set.writing.parts as unknown as object,
          },
          update: {
            parts: set.writing.parts as unknown as object,
          },
        });
      }
    }
    console.log(`[seed_real_exams] ${y.year} 完成`);
  }

  // 3. 灌库后核对 paperId 覆盖率
  const rows = await prisma.realExamPaper.findMany({ where: { deletedAt: null } });
  const dbPaperIds = new Set<string>();
  for (const r of rows) {
    for (const pid of r.paperIds as string[]) dbPaperIds.add(pid);
  }
  const missing = [...expectedPaperIds].filter((id) => !dbPaperIds.has(id));
  if (missing.length > 0) {
    console.error(`[seed_real_exams] ❌ ${missing.length} 个 paperId 缺失：`);
    for (const id of missing.slice(0, 20)) console.error(`  - ${id}`);
    process.exit(1);
  }

  console.log(`[seed_real_exams] ✅ 完成：${rows.length} 套卷，${dbPaperIds.size} 个 paperId 全部对齐`);
}

main()
  .catch((e) => {
    console.error('[seed_real_exams] ❌ 失败', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
