-- MARES — Pesquisador vinculado passa a gerir o protocolo da própria pesquisa.
--
-- Até aqui, escrever em "ResearchProtocol" exigia ORG_ADMIN, o que impedia o pesquisador de
-- definir o protocolo da pesquisa a que está vinculado (ver docs/PERMISSOES.md §Protocolo).
-- A nova regra espelha as rotas:
--   • INSERT / UPDATE (adicionar, ativar/desativar) — quem ENXERGA a pesquisa: ORG_ADMIN da
--     org (todas) ou pesquisador VINCULADO à pesquisa (ResearchMember).
--   • DELETE — mais restrito, por ser irreversível (apaga as análises da combinação junto):
--     ORG_ADMIN da org ou o CRIADOR da pesquisa. Os demais vinculados desativam a entrada.
--
-- Também cria a policy de UPDATE, que não existia: ativar/desativar uma entrada (PATCH) é
-- agora uma operação de pesquisador, e sem policy o UPDATE ficaria negado por padrão para
-- qualquer acesso via Data API.
--
-- RLS aqui é defesa em profundidade: o app acessa via Prisma (role postgres, que ignora RLS)
-- e a autorização efetiva está nas rotas.

-- ─────────────────────────────────────────────────────────────
-- 1. Helper: o usuário está vinculado a esta pesquisa?
--    SECURITY DEFINER para poder ler "ResearchMember" sem esbarrar na policy da própria tabela
--    (researchmember_select_self), seguindo o padrão de is_org_member/has_org_role.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_research_member(research_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."ResearchMember" rm
    WHERE rm."userId" = (SELECT auth.uid()::text) AND rm."researchId" = research_id
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 2. Adicionar / ativar / desativar: admin da org OU pesquisador vinculado.
--    A checagem de org continua explícita: o vínculo por si só não dispensa ser membro da
--    organização dona da pesquisa.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "protocol_insert" ON public."ResearchProtocol";
CREATE POLICY "protocol_insert" ON public."ResearchProtocol"
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId"
      AND public.is_org_member(r."orgId")
      AND (public.has_org_role(r."orgId", ARRAY['ORG_ADMIN']) OR public.is_research_member(r.id))
  ));

DROP POLICY IF EXISTS "protocol_update" ON public."ResearchProtocol";
CREATE POLICY "protocol_update" ON public."ResearchProtocol"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId"
      AND public.is_org_member(r."orgId")
      AND (public.has_org_role(r."orgId", ARRAY['ORG_ADMIN']) OR public.is_research_member(r.id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId"
      AND public.is_org_member(r."orgId")
      AND (public.has_org_role(r."orgId", ARRAY['ORG_ADMIN']) OR public.is_research_member(r.id))
  ));

-- ─────────────────────────────────────────────────────────────
-- 3. Excluir: irreversível (a rota apaga junto as análises da combinação), então continua
--    restrito — admin da org OU o CRIADOR da pesquisa. Mesma regra de canManageResearch()
--    em src/lib/research-access.ts.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "protocol_delete" ON public."ResearchProtocol";
CREATE POLICY "protocol_delete" ON public."ResearchProtocol"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId"
      AND public.is_org_member(r."orgId")
      AND (
        public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
        OR r."createdById" = (SELECT auth.uid()::text)
      )
  ));
