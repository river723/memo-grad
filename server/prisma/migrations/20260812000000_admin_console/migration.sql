-- 后台管理扩展：User 加封禁元数据，新增 AdminActionLog 与 Announcement。
-- 这是 Phase A 迁移；所有变更都是加性的，不删任何字段，不动现有数据。

-- AlterTable：users 增加 disabled_at / disabled_reason / disabled_by_id
ALTER TABLE "users"
  ADD COLUMN "disabled_at"      TIMESTAMP(3),
  ADD COLUMN "disabled_reason"  TEXT,
  ADD COLUMN "disabled_by_id"   TEXT;

-- CreateTable：admin_action_logs
CREATE TABLE "admin_action_logs" (
    "id"            TEXT NOT NULL,
    "admin_user_id" TEXT,
    "action"        TEXT NOT NULL,
    "target_type"   TEXT NOT NULL,
    "target_id"     TEXT NOT NULL,
    "target_user_id" TEXT,
    "before"        JSONB,
    "after"         JSONB,
    "ip_address"    TEXT,
    "user_agent"    TEXT,
    "note"          TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable：announcements
CREATE TABLE "announcements" (
    "id"            TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "body"          TEXT NOT NULL,
    "audience"      TEXT NOT NULL DEFAULT 'all',
    "starts_at"     TIMESTAMP(3) NOT NULL,
    "ends_at"       TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex：admin_action_logs
CREATE INDEX "admin_action_logs_admin_user_id_created_at_idx" ON "admin_action_logs"("admin_user_id", "created_at");
CREATE INDEX "admin_action_logs_target_type_target_id_created_at_idx" ON "admin_action_logs"("target_type", "target_id", "created_at");
CREATE INDEX "admin_action_logs_action_created_at_idx" ON "admin_action_logs"("action", "created_at");

-- CreateIndex：announcements
CREATE INDEX "announcements_starts_at_ends_at_idx" ON "announcements"("starts_at", "ends_at");
CREATE INDEX "announcements_audience_starts_at_idx" ON "announcements"("audience", "starts_at");

-- AddForeignKey：admin_action_logs.admin_user_id → users.id (SetNull)
ALTER TABLE "admin_action_logs"
  ADD CONSTRAINT "admin_action_logs_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey：admin_action_logs.target_user_id → users.id (SetNull)
ALTER TABLE "admin_action_logs"
  ADD CONSTRAINT "admin_action_logs_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey：announcements.created_by_id → users.id (SetNull)
ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey：users.disabled_by_id → users.id (SetNull) — 自引用
ALTER TABLE "users"
  ADD CONSTRAINT "users_disabled_by_id_fkey"
  FOREIGN KEY ("disabled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
