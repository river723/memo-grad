-- CreateTable
CREATE TABLE "word_dict_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "etag" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "word_dict_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_dict_entries" (
    "word" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "definitions" JSONB NOT NULL,
    "etymology" TEXT,
    "similar_words" JSONB NOT NULL,
    "suggested_difficulty" INTEGER,
    "exam_frequency" INTEGER,
    "memory_tip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "word_dict_entries_pkey" PRIMARY KEY ("word")
);

-- CreateTable
CREATE TABLE "real_exam_papers" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "set_id" TEXT NOT NULL,
    "paper_ids" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "real_exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "real_exam_passages" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_ref_id" TEXT NOT NULL,
    "passage_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "passage" TEXT NOT NULL,
    "paragraphs" JSONB NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "real_exam_passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "real_exam_clozes" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_ref_id" TEXT NOT NULL,
    "passage" TEXT NOT NULL,
    "paragraphs" JSONB NOT NULL,
    "blanks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "real_exam_clozes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "real_exam_newtypes" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_ref_id" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "real_exam_newtypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "real_exam_translations" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_ref_id" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "passage" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "real_exam_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "real_exam_writings" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "paper_ref_id" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "real_exam_writings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "word_dict_versions_version_key" ON "word_dict_versions"("version");

-- CreateIndex
CREATE INDEX "word_dict_entries_version_id_idx" ON "word_dict_entries"("version_id");

-- CreateIndex
CREATE INDEX "real_exam_papers_year_set_id_idx" ON "real_exam_papers"("year", "set_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_papers_year_set_id_key" ON "real_exam_papers"("year", "set_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_passages_paper_id_key" ON "real_exam_passages"("paper_id");

-- CreateIndex
CREATE INDEX "real_exam_passages_paper_ref_id_idx" ON "real_exam_passages"("paper_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_clozes_paper_id_key" ON "real_exam_clozes"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_clozes_paper_ref_id_key" ON "real_exam_clozes"("paper_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_newtypes_paper_id_key" ON "real_exam_newtypes"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_newtypes_paper_ref_id_key" ON "real_exam_newtypes"("paper_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_translations_paper_id_key" ON "real_exam_translations"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_translations_paper_ref_id_key" ON "real_exam_translations"("paper_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_writings_paper_id_key" ON "real_exam_writings"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_exam_writings_paper_ref_id_key" ON "real_exam_writings"("paper_ref_id");

-- AddForeignKey
ALTER TABLE "word_dict_entries" ADD CONSTRAINT "word_dict_entries_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "word_dict_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_exam_passages" ADD CONSTRAINT "real_exam_passages_paper_ref_id_fkey" FOREIGN KEY ("paper_ref_id") REFERENCES "real_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_exam_clozes" ADD CONSTRAINT "real_exam_clozes_paper_ref_id_fkey" FOREIGN KEY ("paper_ref_id") REFERENCES "real_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_exam_newtypes" ADD CONSTRAINT "real_exam_newtypes_paper_ref_id_fkey" FOREIGN KEY ("paper_ref_id") REFERENCES "real_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_exam_translations" ADD CONSTRAINT "real_exam_translations_paper_ref_id_fkey" FOREIGN KEY ("paper_ref_id") REFERENCES "real_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_exam_writings" ADD CONSTRAINT "real_exam_writings_paper_ref_id_fkey" FOREIGN KEY ("paper_ref_id") REFERENCES "real_exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
