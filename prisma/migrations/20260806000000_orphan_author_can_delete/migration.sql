-- MARES — Amostras e arquivos SEM autor passam a ser excluíveis por quem enxerga a pesquisa.
--
-- As migrations 20260805000000 (AnimalMedia."uploadedById") e 20260805010000
-- (Sample."createdById") criaram as colunas de autoria SEM backfill: tudo que já existia ficou
-- com autor NULL e, pela regra "admin da org OU o autor", virou exclusivo do ORG_ADMIN. O
-- pesquisador ficou sem saída para desfazer cadastros antigos — exatamente o que a mudança
-- queria resolver.
--
-- Esta migration ataca o problema em duas frentes:
--
--   1. Recupera o autor REAL das amostras legadas. Desde a timeline do indivíduo, criar amostra
--      grava um evento em "AuditLog" (entity='Sample', field='created') com o userId de quem
--      cadastrou — então na maioria dos casos o autor está no banco, só não estava na coluna.
--      Mídia não tem evento equivalente (upload não entra na timeline): segue sem backfill.
--
--   2. Para o que continuar sem autor — amostras anteriores ao próprio evento de auditoria,
--      mídias antigas, e qualquer registro cujo autor foi removido do sistema (as FKs são
--      ON DELETE SET NULL) — a regra deixa de ser "só o admin" e passa a ser "qualquer
--      pesquisador VINCULADO à pesquisa". Sem dono, a decisão é do grupo que enxerga o dado.
--
-- Continua valendo a trava independente da autoria: amostra com análises não é excluída por
-- ninguém (409 na rota), para não arrastar resultado científico junto.
--
-- RLS aqui é defesa em profundidade: o app acessa via Prisma (role postgres, que ignora RLS)
-- e a autorização efetiva está nas rotas (src/app/api/samples/[id] e src/app/api/media/[id],
-- que usam canDeleteAuthored() de src/lib/authorship.ts).
--
-- De quebra, conserta um bug de escopo na política "sample_delete" de 20260805010000: dentro do
-- EXISTS, o "createdById" sem qualificação resolvia para "Research"."createdById" (a subquery
-- tem "Research" no FROM, e o Postgres busca no escopo interno antes do externo) — ou seja,
-- comparava o criador da PESQUISA, não o da amostra. Aqui todas as colunas da tabela alvo vêm
-- qualificadas com public."Sample"/public."AnimalMedia".

-- ─────────────────────────────────────────────────────────────
-- 1. Backfill do autor das amostras pelo evento de criação na auditoria.
--    DISTINCT ON + ORDER BY changedAt: se houver mais de um evento 'created' para a mesma
--    amostra, vale o primeiro.
--
--    Só atribui a autoria a quem AINDA é membro da organização da amostra. Dois motivos: o
--    "AuditLog"."userId" não tem FK para "User" (o EXISTS evita violar Sample_createdById_fkey
--    com o id de um usuário já removido) e, principalmente, atribuir a um ex-membro faria a
--    amostra deixar de ser órfã sem ninguém poder excluí-la além do admin — o oposto do que
--    esta migration quer. Sem membro correspondente, ela segue órfã e o grupo decide.
-- ─────────────────────────────────────────────────────────────
UPDATE "Sample" s
SET "createdById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "AuditLog"
  WHERE entity = 'Sample' AND field = 'created'
  ORDER BY "entityId", "changedAt" ASC
) a
WHERE a."entityId" = s.id
  AND s."createdById" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."userId" = a."userId" AND m."orgId" = s."orgId"
  );

-- ─────────────────────────────────────────────────────────────
-- 2. Excluir amostra: admin da org, OU o criador, OU (sem criador + vinculado à pesquisa).
--    O vínculo é checado na pesquisa DONA da amostra ("Sample"."researchId"), que é a mesma
--    que a rota valida com assertResearchVisible().
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sample_delete" ON public."Sample";
CREATE POLICY "sample_delete" ON public."Sample"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = public."Sample"."animalId"
      AND public.is_org_member(r."orgId")
      AND (
        public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
        OR public."Sample"."createdById" = (SELECT auth.uid()::text)
        OR (
          public."Sample"."createdById" IS NULL
          AND public.is_research_member(public."Sample"."researchId")
        )
      )
  ));

-- ─────────────────────────────────────────────────────────────
-- 3. Excluir mídia: mesma regra, com o autor do upload.
--    Ressalva: o arquivo não tem pesquisa própria, então o vínculo é checado na pesquisa
--    PRIMÁRIA do indivíduo, enquanto a rota usa assertAnimalVisible() (primária ∪
--    participações aceitas). Ou seja, para indivíduo compartilhado esta política é mais
--    restrita que a rota — aceitável em defesa em profundidade.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "media_delete" ON public."AnimalMedia";
CREATE POLICY "media_delete" ON public."AnimalMedia"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = public."AnimalMedia"."animalId"
      AND public.is_org_member(r."orgId")
      AND (
        public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
        OR public."AnimalMedia"."uploadedById" = (SELECT auth.uid()::text)
        OR (
          public."AnimalMedia"."uploadedById" IS NULL
          AND public.is_research_member(r.id)
        )
      )
  ));
