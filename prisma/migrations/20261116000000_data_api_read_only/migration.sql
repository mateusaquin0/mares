-- A Data API do Supabase (PostgREST) passa a ser SOMENTE LEITURA para anon e authenticated.
--
-- A aplicação lê e escreve pelo servidor (Prisma); nenhuma tela usa a Data API para tabelas.
-- Mesmo assim os GRANTs de escrita continuavam valendo para quem chamasse /rest/v1 direto, e
-- o RLS só isola por organização — não conhece papel, escopo por pesquisa, protocolo nem
-- auditoria. Na prática:
--   • a policy "user_update" liberava ao próprio usuário a linha inteira de "User", inclusive
--     "isSystemAdmin": qualquer conta autenticada podia se promover a admin global;
--   • qualquer membro do grupo alterava um resultado sem gerar AuditLog, ou tornava pública
--     uma pesquisa/indivíduo que só o admin pode publicar;
--   • Feedback e CatalogRequest aceitavam INSERT em nome de outra pessoa.
--
-- As policies de escrita permanecem criadas, mas deixam de ser alcançáveis: sem o privilégio
-- na tabela, o Postgres nega antes de avaliar o RLS. As policies de SELECT seguem valendo.

DROP POLICY IF EXISTS "user_update" ON public."User";

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Tabelas criadas por migrations futuras nascem sem escrita para a Data API (no Supabase, os
-- privilégios padrão do schema public concederiam tudo a anon e authenticated).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
