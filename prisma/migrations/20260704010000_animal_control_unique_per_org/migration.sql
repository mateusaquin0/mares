-- MARES — controlId do animal passa a ser único POR ORGANIZAÇÃO (não global).
-- simbaRecordNumber permanece único global (registro nacional). Denormaliza orgId em
-- Animal (derivado de research) e troca o índice único global de controlId pelo composto.

-- 1) Coluna orgId (nullable para backfill).
ALTER TABLE "Animal" ADD COLUMN "orgId" TEXT;

-- 2) Backfill a partir de research → organização.
UPDATE "Animal" a
SET "orgId" = r."orgId"
FROM "Research" r
WHERE r."id" = a."researchId";

-- 3) Torna obrigatória.
ALTER TABLE "Animal" ALTER COLUMN "orgId" SET NOT NULL;

-- 4) Remove o índice único global de controlId e cria o composto por organização.
--    (NULLs em controlId continuam não conflitando entre si.)
DROP INDEX "Animal_controlId_key";
CREATE UNIQUE INDEX "Animal_orgId_controlId_key" ON "Animal"("orgId", "controlId");
