-- MARES — Segurança: habilita RLS na tabela interna do Prisma.
-- Sem RLS, o PostgREST expõe `_prisma_migrations` aos papéis anon/authenticated.
-- Habilitar RLS (sem políticas) nega acesso a esses papéis; o Prisma acessa como owner do
-- schema (bypassa RLS), então as migrations continuam funcionando normalmente.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
