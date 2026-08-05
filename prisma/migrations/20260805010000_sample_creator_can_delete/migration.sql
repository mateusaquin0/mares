-- MARES — Quem criou a amostra passa a poder excluí-la.
--
-- Criar e editar em "Sample" já eram liberados a qualquer pesquisador com acesso ao animal,
-- mas excluir exigia ORG_ADMIN (ver docs/PERMISSOES.md §Amostras). Junto com o bloqueio de
-- desvincular pesquisa com amostras no indivíduo, isso deixava o pesquisador sem saída para
-- desfazer o próprio cadastro.
--
-- A coluna "createdById" registra o autor. Amostras anteriores a esta migração ficam com
-- NULL — sem autor conhecido, seguem exclusivas do admin da org.
--
-- Continua valendo a trava independente da rota: amostra com análises não é excluída por
-- ninguém (409), para não arrastar resultado científico junto.
--
-- RLS aqui é defesa em profundidade: o app acessa via Prisma (role postgres, que ignora RLS)
-- e a autorização efetiva está nas rotas.

-- ─────────────────────────────────────────────────────────────
-- 1. Autor da amostra. ON DELETE SET NULL: remover o usuário não pode apagar a amostra.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

ALTER TABLE "Sample" DROP CONSTRAINT IF EXISTS "Sample_createdById_fkey";
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 2. Excluir: admin da org OU o criador da amostra.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sample_delete" ON public."Sample";
CREATE POLICY "sample_delete" ON public."Sample"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
      AND public.is_org_member(r."orgId")
      AND (
        public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
        OR "createdById" = (SELECT auth.uid()::text)
      )
  ));
