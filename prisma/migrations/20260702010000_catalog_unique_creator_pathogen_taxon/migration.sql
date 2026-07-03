-- MARES — Catálogos: autor (edita/exclui enquanto não usado), unicidade de nome
-- (case-insensitive) e táxon do patógeno (GBIF).

-- Autor de cada item de catálogo.
ALTER TABLE "Organ" ADD COLUMN "created_by_id" TEXT;
ALTER TABLE "ExamType" ADD COLUMN "created_by_id" TEXT;
ALTER TABLE "Pathogen" ADD COLUMN "created_by_id" TEXT;

-- Táxon do patógeno (GBIF): família, ordem e usageKey.
ALTER TABLE "Pathogen" ADD COLUMN "taxon_family" TEXT;
ALTER TABLE "Pathogen" ADD COLUMN "taxon_order" TEXT;
ALTER TABLE "Pathogen" ADD COLUMN "taxon_id" INTEGER;

-- Unicidade de nome por catálogo (case-insensitive). Órgão/Exame pelo nome PT;
-- patógeno pelo nome científico (grupos científicos) ou nome PT (grupos comuns).
CREATE UNIQUE INDEX "Organ_name_pt_key" ON "Organ" (lower(("name" ->> 'pt')));
CREATE UNIQUE INDEX "ExamType_name_pt_key" ON "ExamType" (lower(("name" ->> 'pt')));
CREATE UNIQUE INDEX "Pathogen_sci_key" ON "Pathogen" (lower("scientific_name")) WHERE "scientific_name" IS NOT NULL;
CREATE UNIQUE INDEX "Pathogen_name_pt_key" ON "Pathogen" (lower(("name" ->> 'pt'))) WHERE "name" IS NOT NULL;

-- Índices dos autores.
CREATE INDEX "Organ_created_by_id_idx" ON "Organ"("created_by_id");
CREATE INDEX "ExamType_created_by_id_idx" ON "ExamType"("created_by_id");
CREATE INDEX "Pathogen_created_by_id_idx" ON "Pathogen"("created_by_id");
