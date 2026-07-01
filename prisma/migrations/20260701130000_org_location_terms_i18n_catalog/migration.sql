-- MARES — Localização da organização, aceite de termos e catálogos internacionalizados.

-- Organization: campos de localização (opcionais).
ALTER TABLE "Organization"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT;

-- User: aceite dos Termos de Uso (versão + data).
ALTER TABLE "User"
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);

-- Catálogos internacionalizados (Organ / Pathogen / ExamType).
-- As tabelas são catálogos globais re-populados pelo seed; suas dependentes
-- (ResearchProtocol / Sample / Analysis) estão vazias nesta fase.
TRUNCATE TABLE "Organ", "Pathogen", "ExamType" CASCADE;

-- Organ: label -> name_pt/name_en + group_pt/group_en.
ALTER TABLE "Organ" DROP COLUMN "label";
ALTER TABLE "Organ"
  ADD COLUMN "name_pt" TEXT NOT NULL,
  ADD COLUMN "name_en" TEXT NOT NULL,
  ADD COLUMN "group_pt" TEXT,
  ADD COLUMN "group_en" TEXT;

-- Pathogen: name/group -> key + name_pt/name_en + group_pt/group_en.
DROP INDEX IF EXISTS "Pathogen_name_key";
ALTER TABLE "Pathogen" DROP COLUMN "name", DROP COLUMN "group";
ALTER TABLE "Pathogen"
  ADD COLUMN "key" TEXT NOT NULL,
  ADD COLUMN "name_pt" TEXT NOT NULL,
  ADD COLUMN "name_en" TEXT NOT NULL,
  ADD COLUMN "group_pt" TEXT,
  ADD COLUMN "group_en" TEXT;
CREATE UNIQUE INDEX "Pathogen_key_key" ON "Pathogen"("key");

-- ExamType: name -> key + name_pt/name_en + group_pt/group_en.
DROP INDEX IF EXISTS "ExamType_name_key";
ALTER TABLE "ExamType" DROP COLUMN "name";
ALTER TABLE "ExamType"
  ADD COLUMN "key" TEXT NOT NULL,
  ADD COLUMN "name_pt" TEXT NOT NULL,
  ADD COLUMN "name_en" TEXT NOT NULL,
  ADD COLUMN "group_pt" TEXT,
  ADD COLUMN "group_en" TEXT;
CREATE UNIQUE INDEX "ExamType_key_key" ON "ExamType"("key");
