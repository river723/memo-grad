-- 为 stories.series_title 加唯一约束（seed 脚本 upsert 的锚点）
CREATE UNIQUE INDEX "stories_series_title_key" ON "stories"("series_title");
