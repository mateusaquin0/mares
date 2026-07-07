-- MARES — Medida quantitativa configurável por tipo de exame (Ct no qPCR, Título nas
-- serologias, OD no ELISA...). O valor por análise permanece na coluna Analysis."ctValue"
-- (agora mapeada ao campo Prisma measureValue), preservando os dados existentes.

ALTER TABLE "ExamType" ADD COLUMN "measureLabel" JSONB;
ALTER TABLE "ExamType" ADD COLUMN "measureUnit" TEXT;

-- Exames padrão com leitura quantitativa (reflete o seed).
UPDATE "ExamType" SET "measureLabel" = '{"pt":"Ct","en":"Ct"}'::jsonb WHERE "key" = 'qpcr';
UPDATE "ExamType" SET "measureLabel" = '{"pt":"Título (1:)","en":"Titer (1:)"}'::jsonb
  WHERE "key" IN ('soroneutralizacao', 'ifi', 'hai');
UPDATE "ExamType" SET "measureLabel" = '{"pt":"OD / Título","en":"OD / titer"}'::jsonb
  WHERE "key" = 'elisa';
