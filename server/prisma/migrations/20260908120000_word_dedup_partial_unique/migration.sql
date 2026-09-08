-- 多设备云同步「同词重复」修复。
--
-- 问题：两台设备同日自动配词会确定性选出同一个词，但各自生成不同 UUID；
-- 服务端按 id upsert、客户端按 id 合并，导致同一 (user_id, lower(word))
-- 在 words 表出现多行，用户生词本里同一个词显示两次。
--
-- 本 migration 做两件事：
--   1) 清洗存量——每个重复组保留一条 canonical，其余软删（保留删除事实经增量同步
--      下发到各端），并把所有指向冗余 id 的外键 / JSON 引用迁移到 canonical；
--   2) 建部分唯一索引 (user_id, lower(word)) WHERE deleted_at IS NULL，从根上杜绝新增。
--      软删行不参与约束（软删后允许重新加同词，符合 addWord 现有语义）。
--
-- canonical 选取（组内均未软删）：definitions 非空优先 > updated_at 最新 > id 字典序最小。
-- 大小写不敏感：业务上 word 按 toLowerCase 比对，但入库保留原词形，故索引建在 lower(word) 上。

DO $$
DECLARE
  grp RECORD;
  canon TEXT;
  dup TEXT;
BEGIN
  FOR grp IN
    SELECT user_id,
           lower(word) AS wkey,
           array_agg(id ORDER BY id ASC) AS ids
    FROM words
    WHERE deleted_at IS NULL
    GROUP BY user_id, lower(word)
    HAVING count(*) > 1
  LOOP
    -- 选 canonical 行
    SELECT id INTO canon
    FROM words
    WHERE user_id = grp.user_id
      AND lower(word) = grp.wkey
      AND deleted_at IS NULL
    ORDER BY
      (CASE WHEN jsonb_typeof(definitions) = 'array'
                 AND jsonb_array_length(definitions) > 0
            THEN 0 ELSE 1 END),
      updated_at DESC,
      id ASC
    LIMIT 1;

    FOREACH dup IN ARRAY grp.ids LOOP
      IF dup = canon THEN
        CONTINUE;
      END IF;

      -- 列字段外键迁移（study_records / study_plans 无外键约束、无唯一约束，直接 UPDATE；
      -- 同一 canonical 下允许多条学习/计划记录共存，属正常多次学习，不去重）
      UPDATE study_records
        SET word_id = canon, updated_at = now()
        WHERE user_id = grp.user_id AND word_id = dup;
      UPDATE study_plans
        SET word_id = canon, updated_at = now()
        WHERE user_id = grp.user_id AND word_id = dup;

      -- JSON 内嵌 id 迁移（UUID 定长 36 字符且全局唯一，不会是别的串的子串，文本替换安全）
      UPDATE articles
        SET word_ids = replace(word_ids::text, dup, canon)::jsonb,
            updated_at = now()
        WHERE user_id = grp.user_id
          AND word_ids::text LIKE concat('%', dup, '%');
      UPDATE exam_sessions
        SET questions = replace(questions::text, dup, canon)::jsonb,
            answers   = replace(answers::text,   dup, canon)::jsonb,
            updated_at = now()
        WHERE user_id = grp.user_id
          AND (questions::text LIKE concat('%', dup, '%')
               OR answers::text LIKE concat('%', dup, '%'));
      UPDATE wrong_questions
        SET question = replace(question::text, dup, canon)::jsonb,
            updated_at = now()
        WHERE user_id = grp.user_id
          AND question::text LIKE concat('%', dup, '%');

      -- 软删冗余行：不物理删——删除事实需经增量同步下发；部分唯一索引不含软删行，不冲突
      UPDATE words
        SET deleted_at = now(), updated_at = now()
        WHERE id = dup AND user_id = grp.user_id;
    END LOOP;
  END LOOP;
END $$;

-- 部分唯一索引：同一用户、同一词（大小写不敏感）在未软删范围内唯一。
-- Prisma schema 无法表达「表达式 + 部分」索引，以原生 SQL 为准（schema 里仅有注释说明）。
CREATE UNIQUE INDEX IF NOT EXISTS "words_user_word_lower_unique"
  ON "words" ("user_id", lower("word"))
  WHERE "deleted_at" IS NULL;
