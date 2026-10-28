-- MARES — Ocultar um indivíduo compartilhado numa pesquisa.
--
-- O pesquisador passa a poder excluir o indivíduo, exceto quando ele é compartilhado com
-- outra pesquisa. Nesse caso, a alternativa é OCULTÁ-LO na própria pesquisa: ele sai da
-- listagem, do mapa e do dashboard dela, mas os dados ficam e a ação é reversível. Ver
-- docs/PERMISSOES.md §Animais.
--
-- O vínculo da pesquisa primária vive no próprio Animal (researchId) e o das demais em
-- AnimalResearch, por isso a marca existe nos dois lugares. Sem backfill: NULL = visível.

ALTER TABLE "Animal" ADD COLUMN "primaryHiddenAt" TIMESTAMP(3);

ALTER TABLE "AnimalResearch" ADD COLUMN "hiddenAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────
-- Exclusão do indivíduo pelo pesquisador (RLS, defesa em profundidade — a autorização
-- efetiva está em DELETE /api/animals/[id]).
--
-- Antes só o ORG_ADMIN excluía. Agora também o pesquisador VINCULADO à pesquisa primária,
-- desde que nenhuma outra pesquisa estude o indivíduo (participação aceita). O bloqueio por
-- amostras continua só na rota, como antes.
--
-- A checagem de compartilhamento vai num helper SECURITY DEFINER: lida como o próprio
-- usuário, a policy de "AnimalResearch" esconderia participações de pesquisas que ele não
-- integra, e o indivíduo pareceria não compartilhado.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.animal_is_shared(animal_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."AnimalResearch" ar
    WHERE ar."animalId" = animal_id AND ar."status" = 'ACCEPTED'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "animal_delete" ON public."Animal";
CREATE POLICY "animal_delete" ON public."Animal"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId"
      AND public.is_org_member(r."orgId")
      AND (
        public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
        OR (public.is_research_member(r.id) AND NOT public.animal_is_shared("Animal".id))
      )
  ));
