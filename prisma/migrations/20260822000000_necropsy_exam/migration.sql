-- MARES — Laudo anatomopatológico (macro) e histopatológico (micro) do indivíduo.
--   `NecropsySystemExam`    → o pronunciamento sobre UM sistema anatômico. Sem linha =
--                             "não avaliado", quarto estado que não se confunde com
--                             NO_CHANGE (examinado e normal) nem NOT_EXAMINED (com motivo).
--   `GrossFinding`          → as linhas da tabela de achados macroscópicos do SIMBA.
--   `HistopathologyFinding` → os pares "Órgão: X. Achado: Y." do exame microscópico.
--
-- As três penduram no ANIMAL, não na pesquisa: o laudo descreve a carcaça (como
-- bodyCondition/necropsyDate), então um indivíduo compartilhado tem um laudo só, visível e
-- editável pelas duas pesquisas. Ver docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.
--
-- Sem backfill: `Animal.macroscopicNotes` continua sendo o "exame externo" do SIMBA (texto
-- corrido de outro campo), não uma tabela de achados por sistema.

CREATE TYPE "NecropsySystemStatus" AS ENUM ('NO_CHANGE', 'NOT_EXAMINED', 'ALTERED');

-- ─────────────────────────────────────────────────────────────
-- 1. Tabelas
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "NecropsySystemExam" (
    "id"                TEXT NOT NULL,
    "animalId"          TEXT NOT NULL,
    -- Chave do vocabulário fixo de sistemas (src/lib/necropsy-enums.ts), gravada como
    -- texto: acrescentar um sistema é uma linha de código, sem migration.
    "system"            TEXT NOT NULL,
    "status"            "NecropsySystemStatus" NOT NULL,
    "notExaminedReason" TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NecropsySystemExam_pkey" PRIMARY KEY ("id")
);

-- Um pronunciamento por sistema em cada indivíduo.
CREATE UNIQUE INDEX "NecropsySystemExam_animalId_system_key" ON "NecropsySystemExam"("animalId", "system");
CREATE INDEX "NecropsySystemExam_animalId_idx" ON "NecropsySystemExam"("animalId");

CREATE TABLE "GrossFinding" (
    "id"                 TEXT NOT NULL,
    "examId"             TEXT NOT NULL,
    "topography"         TEXT NOT NULL,
    "lesion"             TEXT NOT NULL,
    "distribution"       TEXT,
    "severity"           TEXT,
    "notes"              TEXT,
    -- Tri-estado do SIMBA: NULL = "não informado", diferente de false = "não".
    "parasitesPresent"   BOOLEAN,
    "parasitesCollected" BOOLEAN,
    "parasiteCount"      INTEGER,
    "position"           INTEGER NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrossFinding_pkey" PRIMARY KEY ("id")
);

-- Leitura: sempre por exame, na ordem da tabela.
CREATE INDEX "GrossFinding_examId_position_idx" ON "GrossFinding"("examId", "position");

CREATE TABLE "HistopathologyFinding" (
    "id"        TEXT NOT NULL,
    "animalId"  TEXT NOT NULL,
    "organId"   TEXT NOT NULL,
    "finding"   TEXT NOT NULL,
    "position"  INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistopathologyFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HistopathologyFinding_animalId_position_idx" ON "HistopathologyFinding"("animalId", "position");
-- Suporta a checagem de "em uso" do glossário (não excluir órgão citado num laudo).
CREATE INDEX "HistopathologyFinding_organId_idx" ON "HistopathologyFinding"("organId");

-- ─────────────────────────────────────────────────────────────
-- 2. Chaves estrangeiras
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "NecropsySystemExam"
    ADD CONSTRAINT "NecropsySystemExam_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrossFinding"
    ADD CONSTRAINT "GrossFinding_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "NecropsySystemExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HistopathologyFinding"
    ADD CONSTRAINT "HistopathologyFinding_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catálogo global: sem cascade, como nas demais referências a Organ.
ALTER TABLE "HistopathologyFinding"
    ADD CONSTRAINT "HistopathologyFinding_organId_fkey"
    FOREIGN KEY ("organId") REFERENCES "Organ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 3. GRANTs + RLS
--
--    O GRANT de 20260630232223 valeu só para as tabelas existentes na época; tabela nova
--    precisa de GRANT explícito (mesma nota da migration de SequenceRecord).
--
--    Policies por join até Research, sem orgId denormalizado — a cadeia é curta. Como nas
--    demais tabelas científicas, o RLS é defesa em profundidade: o Prisma (pooler, role
--    `postgres`) passa por cima, e a autorização real está na API.
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public."NecropsySystemExam"    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."GrossFinding"          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."HistopathologyFinding" TO authenticated;
GRANT SELECT ON public."NecropsySystemExam"    TO anon;
GRANT SELECT ON public."GrossFinding"          TO anon;
GRANT SELECT ON public."HistopathologyFinding" TO anon;

ALTER TABLE public."NecropsySystemExam"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GrossFinding"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HistopathologyFinding" ENABLE ROW LEVEL SECURITY;

-- NecropsySystemExam → Animal → Research

CREATE POLICY "necropsy_exam_select" ON public."NecropsySystemExam"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
    AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "necropsy_exam_insert" ON public."NecropsySystemExam"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "necropsy_exam_update" ON public."NecropsySystemExam"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "necropsy_exam_delete" ON public."NecropsySystemExam"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));

-- GrossFinding → NecropsySystemExam → Animal → Research

CREATE POLICY "gross_finding_select" ON public."GrossFinding"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."NecropsySystemExam" e
    JOIN public."Animal" a ON a.id = e."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE e.id = "examId"
    AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "gross_finding_insert" ON public."GrossFinding"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."NecropsySystemExam" e
    JOIN public."Animal" a ON a.id = e."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE e.id = "examId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "gross_finding_update" ON public."GrossFinding"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."NecropsySystemExam" e
    JOIN public."Animal" a ON a.id = e."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE e.id = "examId" AND public.is_org_member(r."orgId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."NecropsySystemExam" e
    JOIN public."Animal" a ON a.id = e."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE e.id = "examId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "gross_finding_delete" ON public."GrossFinding"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."NecropsySystemExam" e
    JOIN public."Animal" a ON a.id = e."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE e.id = "examId" AND public.is_org_member(r."orgId")
  ));

-- HistopathologyFinding → Animal → Research

CREATE POLICY "histopathology_select" ON public."HistopathologyFinding"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
    AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "histopathology_insert" ON public."HistopathologyFinding"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "histopathology_update" ON public."HistopathologyFinding"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "histopathology_delete" ON public."HistopathologyFinding"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));
