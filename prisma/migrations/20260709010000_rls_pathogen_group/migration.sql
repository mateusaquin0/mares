-- MARES — Fecha a lacuna de RLS na PathogenGroup.
-- A tabela foi criada depois da migration de políticas (20260630232223_rls_policies) e ficou
-- como "Unrestricted" na Data API (PostgREST). A aplicação acessa via Prisma (role postgres,
-- que ignora RLS); isto é defesa em profundidade, no mesmo padrão de Organ/Pathogen/ExamType.
--
-- PathogenGroup é vocabulário controlado (grupos fixos, semeados). Liberamos apenas LEITURA
-- (authenticated + anon, p/ o mapa público). Não há policy de escrita: INSERT/UPDATE/DELETE
-- via Data API ficam bloqueados; a manutenção é feita pelo seed/Prisma.

ALTER TABLE public."PathogenGroup" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pathogengroup_select_auth" ON public."PathogenGroup" FOR SELECT TO authenticated USING (true);
CREATE POLICY "pathogengroup_select_anon" ON public."PathogenGroup" FOR SELECT TO anon USING (true);
