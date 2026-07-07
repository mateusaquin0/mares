-- MARES — Compartilhamento de indivíduo entre pesquisas do mesmo grupo (Etapa 1).
-- Um Animal (indivíduo físico, identidade única por org) pode ser estudado por várias
-- pesquisas da MESMA organização. A pesquisa primária/criadora permanece em Animal.researchId;
-- esta tabela registra as participações ADICIONAIS, sem duplicar a identidade do indivíduo.

CREATE TABLE "AnimalResearch" (
    "animalId"   TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalResearch_pkey" PRIMARY KEY ("animalId", "researchId")
);

CREATE INDEX "AnimalResearch_researchId_idx" ON "AnimalResearch"("researchId");

ALTER TABLE "AnimalResearch"
    ADD CONSTRAINT "AnimalResearch_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnimalResearch"
    ADD CONSTRAINT "AnimalResearch_researchId_fkey"
    FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (defesa em profundidade — a aplicação usa Prisma/role postgres, que IGNORA RLS; ver
-- docs/POLITICAS_RLS.md). Habilita RLS sempre (nega acesso via Data API sem política). As
-- políticas escopadas por organização só são criadas se a função auxiliar de RLS existir
-- neste banco — assim a migração não falha em ambientes onde o RLS não foi provisionado.
ALTER TABLE public."AnimalResearch" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('public.user_org_id()') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY "animal_research_select" ON public."AnimalResearch"
        FOR SELECT
        USING (EXISTS (
          SELECT 1 FROM public."Animal" a
          JOIN public."Research" r ON r.id = a."researchId"
          WHERE a.id = "animalId"
          AND (a."orgId" = public.user_org_id() OR (a."isPublic" = true AND r."isPublic" = true))
        ))
    $p$;
    EXECUTE $p$
      CREATE POLICY "animal_research_insert" ON public."AnimalResearch"
        FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public."Animal" a
          WHERE a.id = "animalId" AND a."orgId" = public.user_org_id()
        ))
    $p$;
    EXECUTE $p$
      CREATE POLICY "animal_research_delete" ON public."AnimalResearch"
        FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public."Animal" a
          WHERE a.id = "animalId" AND a."orgId" = public.user_org_id()
        ))
    $p$;
  END IF;
END
$$;
