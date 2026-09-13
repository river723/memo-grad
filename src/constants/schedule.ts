/**
 * 艾宾浩斯间隔重复调度常量。
 *
 * 独立成文件（不放进会引用 `__DEV__` 的 constants/index.ts），
 * 以便纯函数调度内核（scheduler.ts）、jest 单测、离线迁移编译
 * （scripts/test-migration.js 用 tsc 单文件编译）都能在无 RN 运行时环境下引用。
 */

/** 各复习阶段对应的间隔（天）：第 1 次复习隔 1 天、第 2 次隔 2 天……逐级拉长。 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];

/** 最高复习阶段：阶段 1..MAX_REVIEW_STAGE 对应 REVIEW_INTERVALS 的各档，顶格后按最后一档(30天)循环。 */
export const MAX_REVIEW_STAGE = REVIEW_INTERVALS.length;

/** 新词阶段：0 = 从未过关，尚未进入复习阶梯。 */
export const NEW_WORD_STAGE = 0;
