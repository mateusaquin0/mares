-- MARES — Confirmação de espécie por sequenciamento.
-- Ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md.
--
-- Fluxo diagnóstico em duas fases sem inflar o catálogo de protocolos:
--   • RASTREIO   — Analysis com parent_analysis_id NULL (na grade, definida pelo protocolo).
--   • CONFIRMAÇÃO — Analysis-filha pendurada num rastreio POSITIVO, carregando a espécie
--     resolvida (pathogenId) + registros de sequenciamento (SequenceRecord). NÃO exige protocolo.
--
-- Cascade na auto-relação é essencial: deleteProtocolCascade (exclusão de protocolo) mira as
-- análises de RASTREIO; as confirmações têm outra combinação (pathogenId/examTypeId) e só caem
-- junto do pai por ON DELETE CASCADE.

-- ─────────────────────────────────────────────────────────────
-- 1. Analysis.parent_analysis_id (auto-relação, cascade)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Analysis" ADD COLUMN "parent_analysis_id" TEXT;

CREATE INDEX "Analysis_parent_analysis_id_idx" ON "Analysis"("parent_analysis_id");

ALTER TABLE "Analysis"
    ADD CONSTRAINT "Analysis_parent_analysis_id_fkey"
    FOREIGN KEY ("parent_analysis_id") REFERENCES "Analysis"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 2. SequenceRecord
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "SequenceRecord" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "marker" TEXT,
    "accession" TEXT,
    "pct_identity" DOUBLE PRECISION,
    "consensus" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SequenceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SequenceRecord_analysis_id_idx" ON "SequenceRecord"("analysis_id");

ALTER TABLE "SequenceRecord"
    ADD CONSTRAINT "SequenceRecord_analysis_id_fkey"
    FOREIGN KEY ("analysis_id") REFERENCES "Analysis"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 3. RLS e grants para a Data API (PostgREST)
--    Espelha as policies de Analysis (modelo multi-org, 20260701000000): escopo por
--    analysis → sample → animal → research, via is_org_member()/public. Como Analysis, não há
--    policy de DELETE (a exclusão passa pelo app via Prisma, que ignora RLS).
--    A aplicação usa Prisma (role postgres, ignora RLS); isto é defesa em profundidade.
--    O GRANT de 20260630232223 valeu só para as tabelas existentes na época; a tabela nova
--    precisa de GRANT explícito.
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public."SequenceRecord" TO authenticated;
GRANT SELECT ON public."SequenceRecord" TO anon;

ALTER TABLE public."SequenceRecord" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequence_select" ON public."SequenceRecord"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Analysis" an
    JOIN public."Sample" s ON s.id = an."sampleId"
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE an.id = "analysis_id"
    AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "sequence_insert" ON public."SequenceRecord"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Analysis" an
    JOIN public."Sample" s ON s.id = an."sampleId"
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE an.id = "analysis_id" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "sequence_update" ON public."SequenceRecord"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Analysis" an
    JOIN public."Sample" s ON s.id = an."sampleId"
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE an.id = "analysis_id" AND public.is_org_member(r."orgId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Analysis" an
    JOIN public."Sample" s ON s.id = an."sampleId"
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE an.id = "analysis_id" AND public.is_org_member(r."orgId")
  ));
