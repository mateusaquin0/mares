-- MARES — Catálogos i18n via JSON. Órgão/Exame: name (jsonb {pt,en}). Patógeno: name texto
-- (científico/latim) + group (jsonb {pt,en}). Converte os dados existentes das colunas antigas.

-- Organ: name_pt/name_en -> name (jsonb); remove colunas antigas.
ALTER TABLE "Organ" ADD COLUMN "name" JSONB;
UPDATE "Organ" SET "name" = jsonb_build_object('pt', "name_pt", 'en', "name_en");
ALTER TABLE "Organ" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Organ"
  DROP COLUMN "name_pt",
  DROP COLUMN "name_en",
  DROP COLUMN "group_pt",
  DROP COLUMN "group_en";

-- ExamType: idem.
ALTER TABLE "ExamType" ADD COLUMN "name" JSONB;
UPDATE "ExamType" SET "name" = jsonb_build_object('pt', "name_pt", 'en', "name_en");
ALTER TABLE "ExamType" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "ExamType"
  DROP COLUMN "name_pt",
  DROP COLUMN "name_en",
  DROP COLUMN "group_pt",
  DROP COLUMN "group_en";

-- Pathogen: name texto (a partir de name_pt) + group (jsonb a partir de group_pt/en).
ALTER TABLE "Pathogen" ADD COLUMN "name" TEXT;
UPDATE "Pathogen" SET "name" = "name_pt";
ALTER TABLE "Pathogen" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Pathogen" ADD COLUMN "group" JSONB;
UPDATE "Pathogen"
  SET "group" = jsonb_build_object('pt', "group_pt", 'en', "group_en")
  WHERE "group_pt" IS NOT NULL OR "group_en" IS NOT NULL;
ALTER TABLE "Pathogen"
  DROP COLUMN "name_pt",
  DROP COLUMN "name_en",
  DROP COLUMN "group_pt",
  DROP COLUMN "group_en";
