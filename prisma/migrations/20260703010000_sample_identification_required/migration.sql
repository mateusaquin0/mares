-- MARES — Torna a identificação da amostra obrigatória.
-- Backfill das amostras já existentes (criadas antes do campo) com um código
-- provisório derivado do id, e então aplica NOT NULL.
UPDATE "Sample"
SET "identification" = 'AM-' || upper(substr("id", 1, 8))
WHERE "identification" IS NULL;

ALTER TABLE "Sample" ALTER COLUMN "identification" SET NOT NULL;
