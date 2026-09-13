-- AlterTable: 间隔重复（艾宾浩斯）复习调度状态，挂在 words 上随云同步
-- review_stage：复习阶段 0..6（null/0=新词）；next_due_date：下次到期复习日（本地 yyyy-MM-dd）
-- 两列均可空、无 default：PG 11+ 加列不重写表，存量行落 NULL，由客户端 v3 迁移回填。
ALTER TABLE "words" ADD COLUMN     "review_stage" INTEGER;
ALTER TABLE "words" ADD COLUMN     "next_due_date" TEXT;
