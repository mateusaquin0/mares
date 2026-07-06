-- MARES — Identificação da amostra passa a ser única POR ORGANIZAÇÃO (não global).
-- Denormaliza orgId em Sample (derivado de animal→pesquisa), troca o índice único global
-- pelo composto (orgId, identification).

-- 1) Coluna orgId (nullable para backfill).
ALTER TABLE "Sample" ADD COLUMN "orgId" TEXT;

-- 2) Backfill a partir de animal → pesquisa → organização.
UPDATE "Sample" s
SET "orgId" = r."orgId"
FROM "Animal" a
JOIN "Research" r ON r."id" = a."researchId"
WHERE a."id" = s."animalId";

-- 3) Torna obrigatória.
ALTER TABLE "Sample" ALTER COLUMN "orgId" SET NOT NULL;

-- 4) Remove o índice único global e cria o composto por organização.
DROP INDEX "Sample_identification_key";
CREATE UNIQUE INDEX "Sample_orgId_identification_key" ON "Sample"("orgId", "identification");
