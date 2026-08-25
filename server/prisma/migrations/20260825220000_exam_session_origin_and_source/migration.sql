-- 套题模型：origin_id 归属套题根记录（重做行指向首次生成的行），source 区分出题练习/错题复习；
-- last_attempt_at 是中间方案的过渡字段（重做改为插行后不再需要），随本次一并清理。
-- 存量数据默认 source='generation'、origin_id 为空，即全部视为各自套题的根记录。
ALTER TABLE "exam_sessions" ADD COLUMN     "origin_id" TEXT;
ALTER TABLE "exam_sessions" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'generation';
ALTER TABLE "exam_sessions" DROP COLUMN "last_attempt_at";
