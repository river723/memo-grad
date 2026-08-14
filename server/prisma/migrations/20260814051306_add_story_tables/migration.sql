-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "series_title" TEXT NOT NULL,
    "total_words" INTEGER NOT NULL,
    "total_chapters" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_chapters" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "chapter_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "words" JSONB NOT NULL,
    "word_count" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "story_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_chapters_story_id_chapter_id_idx" ON "story_chapters"("story_id", "chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_chapters_story_id_chapter_id_key" ON "story_chapters"("story_id", "chapter_id");

-- AddForeignKey
ALTER TABLE "story_chapters" ADD CONSTRAINT "story_chapters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
