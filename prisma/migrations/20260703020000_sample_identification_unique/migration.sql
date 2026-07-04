-- MARES — Identificação da amostra deve ser única (globalmente).
CREATE UNIQUE INDEX "Sample_identification_key" ON "Sample"("identification");
