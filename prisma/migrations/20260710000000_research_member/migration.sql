-- MARES — Escopo de visibilidade por pesquisa.
-- Introduz o vínculo N:N pesquisador ↔ pesquisa. A partir daqui, um RESEARCHER só enxerga os
-- dados das pesquisas às quais está vinculado (ou que criou); o ORG_ADMIN vê todas as da org.
-- Ver docs/PERMISSOES.md §Escopo por pesquisa.

-- 1. Tabela de vínculo.
CREATE TABLE "ResearchMember" (
  "researchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchMember_pkey" PRIMARY KEY ("researchId", "userId")
);
CREATE INDEX "ResearchMember_userId_idx" ON "ResearchMember"("userId");

ALTER TABLE "ResearchMember"
  ADD CONSTRAINT "ResearchMember_researchId_fkey"
  FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchMember"
  ADD CONSTRAINT "ResearchMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill "começar vazio, exceto criadores": vincula o criador de cada pesquisa existente.
--    Os demais pesquisadores começam sem vínculo (não veem nada até serem atribuídos). O criador
--    já teria acesso pela regra "OU criador", mas o vínculo o faz constar na lista de membros.
INSERT INTO "ResearchMember" ("researchId", "userId", "createdAt")
SELECT r."id", r."createdById", now()
FROM "Research" r
WHERE r."createdById" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. RLS (defesa em profundidade — o app acessa via Prisma, que ignora RLS).
ALTER TABLE "ResearchMember" ENABLE ROW LEVEL SECURITY;

-- Grants para a Data API (tabelas do Prisma precisam de GRANT explícito).
GRANT SELECT, INSERT, UPDATE, DELETE ON "ResearchMember" TO authenticated;
GRANT SELECT ON "ResearchMember" TO anon;

-- Cada usuário só enxerga os próprios vínculos via Data API. A escrita é feita pelo app
-- (Prisma, role postgres) com a autorização de admin/criador nas rotas.
CREATE POLICY "researchmember_select_self" ON "ResearchMember"
  FOR SELECT TO authenticated USING (("userId") = (SELECT auth.uid()::text));
