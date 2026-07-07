-- MARES — Amostra passa a pertencer a UMA pesquisa do indivíduo (Etapa 2).
-- Com o compartilhamento de indivíduo entre pesquisas, cada amostra (e suas análises) é de
-- uma pesquisa específica. Backfill = pesquisa primária do animal (Animal.researchId), que é
-- a dona de todas as amostras existentes até aqui.

ALTER TABLE "Sample" ADD COLUMN "researchId" TEXT;

UPDATE "Sample" s
SET "researchId" = a."researchId"
FROM "Animal" a
WHERE a."id" = s."animalId";

ALTER TABLE "Sample" ALTER COLUMN "researchId" SET NOT NULL;

CREATE INDEX "Sample_researchId_idx" ON "Sample"("researchId");

ALTER TABLE "Sample"
    ADD CONSTRAINT "Sample_researchId_fkey"
    FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
