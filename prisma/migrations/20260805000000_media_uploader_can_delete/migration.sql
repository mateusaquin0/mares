-- MARES — Quem enviou a mídia passa a poder excluí-la.
--
-- Até aqui, excluir em "AnimalMedia" exigia ORG_ADMIN, enquanto o upload era liberado a
-- qualquer pesquisador com acesso ao animal (ver docs/PERMISSOES.md §Mídia). Na prática o
-- pesquisador não conseguia desfazer nem o próprio envio.
--
-- A coluna "uploadedById" registra o autor do upload. Arquivos anteriores a esta migração
-- ficam com NULL — sem autor conhecido, seguem exclusivos do admin da org.
--
-- RLS aqui é defesa em profundidade: o app acessa via Prisma (role postgres, que ignora RLS)
-- e a autorização efetiva está nas rotas.

-- ─────────────────────────────────────────────────────────────
-- 1. Autor do upload. ON DELETE SET NULL: remover o usuário não apaga o arquivo do animal —
--    o dado científico sobrevive ao cadastro de quem o enviou.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "AnimalMedia" ADD COLUMN IF NOT EXISTS "uploadedById" TEXT;

ALTER TABLE "AnimalMedia" DROP CONSTRAINT IF EXISTS "AnimalMedia_uploadedById_fkey";
ALTER TABLE "AnimalMedia" ADD CONSTRAINT "AnimalMedia_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 2. Excluir: admin da org OU o autor do upload.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "media_delete" ON public."AnimalMedia";
CREATE POLICY "media_delete" ON public."AnimalMedia"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
      AND public.is_org_member(r."orgId")
      AND (
        public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
        OR "uploadedById" = (SELECT auth.uid()::text)
      )
  ));
