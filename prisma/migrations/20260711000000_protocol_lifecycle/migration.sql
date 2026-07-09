-- MARES — Ciclo de vida de protocolos e análises (ver docs/PLANO_PROTOCOLO_ANALISES.md).
--
-- Adiciona estado ao protocolo:
--   • ACTIVE   — combinação em uso: aceita novos lançamentos de análise.
--   • INACTIVE — preservada para histórico, mas bloqueia novos cadastros/edições.
-- Excluir um protocolo (fora desta migration, na rota DELETE) passa a apagar retroativamente
-- as análises da combinação; desativar preserva tudo.
--
-- Índice composto (researchId, status) cobre as consultas de "protocolos ativos de uma
-- pesquisa" (validação de análise, grades). Não usamos índice parcial para não divergir do
-- schema Prisma (que não representa índices parciais).

CREATE TYPE "ResearchProtocolStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "ResearchProtocol"
    ADD COLUMN "status" "ResearchProtocolStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE INDEX "ResearchProtocol_researchId_status_idx" ON "ResearchProtocol"("researchId", "status");

-- ─────────────────────────────────────────────────────────────
-- Limpeza obrigatória do estado atual: remover análises órfãs.
--
-- Até aqui, excluir uma entrada de ResearchProtocol NÃO removia dados retroativos, deixando
-- análises que combinam sample.researchId + sample.organId + analysis.pathogenId +
-- analysis.examTypeId sem uma entrada de protocolo correspondente. A partir desta feature a
-- exclusão é destrutiva, então saneamos o histórico agora para manter a invariante
-- "toda análise tem protocolo correspondente".
--
-- Auditoria: antes de aplicar, os órfãos foram contados/exportados fora da migration
-- (script no scratchpad). AuditLog referencia análise por entityId (string, sem FK); logs de
-- análises apagadas aqui permanecem como registro histórico, sem quebrar integridade.
DELETE FROM "Analysis" a
USING "Sample" s
WHERE s.id = a."sampleId"
  AND NOT EXISTS (
    SELECT 1
    FROM "ResearchProtocol" rp
    WHERE rp."researchId" = s."researchId"
      AND rp."organId" = s."organId"
      AND rp."pathogenId" = a."pathogenId"
      AND rp."examTypeId" = a."examTypeId"
  );
