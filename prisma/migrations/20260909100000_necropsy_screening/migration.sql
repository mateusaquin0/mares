-- MARES — Triagem da carcaça na necrópsia: interação antrópica e conteúdo gastrointestinal.
--
-- Quatro perguntas de triagem entram como colunas TRI-ESTADO no Animal (NULL = "não
-- informado", que não é o mesmo que false = "não", como já ocorre nos campos de parasita de
-- GrossFinding), e as interações antrópicas encontradas entram numa tabela própria: a
-- triagem aceita MAIS DE UMA (rede e embarcação na mesma carcaça) e cada uma tem grau
-- próprio, de 1 a 3.
--
-- Ficam no INDIVÍDUO, e não na pesquisa, pelo mesmo motivo do laudo anatomopatológico:
-- descrevem a carcaça. Ver §Decisão estruturante em docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.
--
-- Sem backfill: são dados que não existiam antes, então todo registro anterior fica NULL
-- ("não informado" na tela) até alguém preencher.

-- ─────────────────────────────────────────────────────────────
-- 1. Perguntas de triagem (tri-estado) no Animal
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Animal"
  ADD COLUMN "anthropicInteraction" BOOLEAN,
  ADD COLUMN "giContentCollected"   BOOLEAN,
  ADD COLUMN "giSolidWaste"         BOOLEAN,
  ADD COLUMN "giDetailedScreening"  BOOLEAN;

-- ─────────────────────────────────────────────────────────────
-- 2. Interações antrópicas encontradas, com grau
--
--    Lista fechada (enum) e não catálogo: são as quatro categorias do PMP, iguais para
--    qualquer espécie — mesmo critério de distribuição e severidade, que também vivem em
--    código. O UNIQUE (animalId, type) garante UM grau por tipo: "pesca 2" e "pesca 3" no
--    mesmo indivíduo seria contradição, não duas ocorrências.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "AnthropicInteractionType" AS ENUM ('FISHERY', 'WASTE', 'AGGRESSION', 'VESSEL');

CREATE TABLE "AnthropicInteraction" (
    "id"        TEXT NOT NULL,
    "animalId"  TEXT NOT NULL,
    "type"      "AnthropicInteractionType" NOT NULL,
    "degree"    INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnthropicInteraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnthropicInteraction_animalId_type_key" ON "AnthropicInteraction"("animalId", "type");

ALTER TABLE "AnthropicInteraction"
    ADD CONSTRAINT "AnthropicInteraction_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 3. GRANTs + RLS
--
--    Tabela nova precisa de GRANT explícito (o GRANT de 20260630232223 valeu só para as
--    tabelas existentes na época). Policies iguais às do laudo (20260822000000): join até
--    Research, defesa em profundidade — o Prisma passa por cima e a autorização real está
--    na API.
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public."AnthropicInteraction" TO authenticated;
GRANT SELECT ON public."AnthropicInteraction" TO anon;

ALTER TABLE public."AnthropicInteraction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anthropic_interaction_select" ON public."AnthropicInteraction"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
    AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "anthropic_interaction_insert" ON public."AnthropicInteraction"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "anthropic_interaction_update" ON public."AnthropicInteraction"
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

CREATE POLICY "anthropic_interaction_delete" ON public."AnthropicInteraction"
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));
