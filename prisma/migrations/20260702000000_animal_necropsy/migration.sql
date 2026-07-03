-- MARES — Campos de necrópsia do animal.
-- "Condição da morte" (nova) e data de necrópsia. Os demais campos de necrópsia
-- (condição da carcaça, escore corporal, exame externo) já existem como
-- bodyCondition / decompositionStage / macroscopicNotes.
ALTER TABLE "Animal" ADD COLUMN "deathCondition" TEXT;
ALTER TABLE "Animal" ADD COLUMN "necropsyDate" TIMESTAMP(3);
