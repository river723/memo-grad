/**
 * 冒烟：「太简单」移除词后的计划收尾（幽灵待学修复）。
 * 运行：npx tsx scripts/smoke-too-easy-plans.ts
 * Node 环境下 StorageService 走内存存储，无副作用。
 */

async function main() {
  // RN 全局在 Node 缺失（constants 里用到 __DEV__），先补再动态 import
  (globalThis as any).__DEV__ = true;
  const { default: StorageService } = await import('../src/services/StorageService');

  const makeWord = (word: string) => ({
    word,
    definitions: [{ pos: 'n', meaning: '测试', example: '' }],
    similar_words: [],
    difficulty: 3,
    frequency: 5,
  });

  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`断言失败：${msg}`);
  };

  const svc = StorageService;
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // 1. 加两个词，各建一条今日未完成计划
  const idA = await svc.addWord(makeWord('smokeaa'));
  const idB = await svc.addWord(makeWord('smokebb'));
  await svc.addStudyPlan({ word_id: idA, plan_date: localToday, plan_type: 'new', completed: false });
  await svc.addStudyPlan({ word_id: idB, plan_date: localToday, plan_type: 'new', completed: false });

  let pending = await svc.getTodayStudyPlan();
  assert(pending.length === 2, `初始待学应为 2，实际 ${pending.length}`);

  // 2. 「太简单」路径：软删 A + 收尾其当日计划
  await svc.deleteWord(idA);
  await svc.completeTodayPlansForWord(idA);

  // 3. 断言：A 的计划已完成、B 的仍待学；软删的 A 不出现在生词本
  const plans = await svc.getStudyPlans();
  assert(plans.filter(p => p.word_id === idA).every(p => p.completed), 'A 的计划应全部完成');
  assert(plans.filter(p => p.word_id === idB).every(p => !p.completed), 'B 的计划应仍未完成');
  const words = await svc.getWords();
  assert(words.length === 1 && words[0].id === idB, '软删后生词本只剩 B');

  pending = await svc.getTodayStudyPlan();
  assert(pending.length === 1 && pending[0].word_id === idB,
    `幽灵待学清除：待学应只剩 B，实际 ${pending.length}`);

  // 4. 自愈清扫前置验证：给已删的 A 再建一条计划 → 应出现在待学里 → 清扫后消失
  await svc.addStudyPlan({ word_id: idA, plan_date: localToday, plan_type: 'review', completed: false });
  pending = await svc.getTodayStudyPlan();
  assert(pending.some(p => p.word_id === idA), '被删词的新计划应出现在待学里（清扫目标存在）');
  const validIds = new Set((await svc.getWords()).map(w => w.id));
  for (const p of pending) {
    if (!validIds.has(p.word_id)) await svc.completeStudyPlan(p.id);
  }
  pending = await svc.getTodayStudyPlan();
  assert(!pending.some(p => p.word_id === idA), '清扫后被删词计划不再待学');

  // 5. 幂等：重复收尾不报错
  await svc.completeTodayPlansForWord(idA);

  console.log('✅ 全部断言通过');
}

main().catch(e => { console.error('❌ 失败:', e); process.exit(1); });
