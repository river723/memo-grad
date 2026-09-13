/**
 * 一次性清理服务端 study_plans 历史脏数据（旧版"每词整套重铺 6 天复习计划"的遗留）。
 *
 * 新客户端已改为 Word.review_stage / next_due_date 派生调度，并在 v3 本地迁移里把
 * 未完成计划软删后随同步收敛；本脚本只给"长期不打开 App、本地迁移跑不到"的账号做服务端兜底。
 *
 * 只软删（置 deleted_at，不物理删除）以下**未完成**(completed=false 且 deleted_at 为空) 计划：
 *   1. word_id 为 '' / '0' 的历史占位计划；
 *   2. 指向不存在（或已软删）单词的孤儿计划；
 *   3. 同 (user, word, date, type) 重复计划中保留一条、软删其余；
 *   4. plan_date 严格早于今天的过期 review 计划（旧 bug 膨胀主体）。
 * 已完成(completed=true)历史计划一律保留（周趋势依赖）。
 *
 * 用法：
 *   npx tsx scripts/cleanup_stale_plans.ts            # 仅预览（dry-run）
 *   npx tsx scripts/cleanup_stale_plans.ts --apply    # 真正软删
 */
import { prisma } from '../src/db';

const APPLY = process.argv.includes('--apply');
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TODAY = todayLocal();
const CHUNK = 1000;

async function main() {
  // 分块扫所有未完成计划
  const candidates: {
    id: string; userId: string; wordId: string; planDate: string; planType: string;
  }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows: any[] = await (prisma as any).studyPlan.findMany({
      where: { completed: false, deletedAt: null },
      select: { id: true, userId: true, wordId: true, planDate: true, planType: true },
      take: CHUNK + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });
    const page = rows.slice(0, CHUNK);
    candidates.push(...page);
    if (rows.length <= CHUNK) break;
    cursor = page[page.length - 1].id;
  }

  // 非占位 wordId：批量查它们对应的存活单词，识别孤儿
  const realRefs = new Map<string, Set<string>>(); // userId -> wordIds
  for (const p of candidates) {
    if (p.wordId && p.wordId !== '0') {
      if (!realRefs.has(p.userId)) realRefs.set(p.userId, new Set());
      realRefs.get(p.userId)!.add(p.wordId);
    }
  }
  const existingWordIds = new Set<string>();
  for (const [userId, ids] of realRefs) {
    const words: { id: string }[] = await (prisma as any).word.findMany({
      where: { userId, id: { in: [...ids] }, deletedAt: null },
      select: { id: true },
    });
    for (const w of words) existingWordIds.add(`${userId}::${w.id}`);
  }

  const toDelete = new Set<string>();
  const seenKey = new Set<string>();
  let orphan = 0;
  let placeholder = 0;
  let duplicate = 0;
  let staleReview = 0;

  for (const p of candidates) {
    let reason = '';
    if (!p.wordId || p.wordId === '0') reason = 'placeholder';
    else if (!existingWordIds.has(`${p.userId}::${p.wordId}`)) reason = 'orphan';
    const dedupKey = `${p.userId}::${p.wordId}::${p.planDate}::${p.planType}`;
    if (!reason && seenKey.has(dedupKey)) reason = 'duplicate';
    if (!reason && p.planType === 'review' && p.planDate < TODAY) reason = 'stale-review';

    if (reason) {
      toDelete.add(p.id);
      if (reason === 'orphan') orphan++;
      else if (reason === 'placeholder') placeholder++;
      else if (reason === 'duplicate') duplicate++;
      else if (reason === 'stale-review') staleReview++;
    } else {
      seenKey.add(dedupKey);
    }
  }

  console.log(`扫描未完成计划 ${candidates.length} 条；计划软删 ${toDelete.size} 条：`);
  console.log(
    `  占位=${placeholder} 孤儿=${orphan} 重复=${duplicate} 过期复习=${staleReview}`
  );

  if (!APPLY) {
    console.log('\n[dry-run] 未写入。确认后加 --apply 执行软删。');
    return;
  }

  const ids = [...toDelete];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    await (prisma as any).studyPlan.updateMany({
      where: { id: { in: batch } },
      data: { deletedAt: new Date() },
    });
  }
  console.log(`\n已软删 ${ids.length} 条。`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
