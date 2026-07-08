-- Shim mínimo para aplicar as migrations num Postgres "puro" (ex.: serviço do CI).
-- As migrations do MARES assumem o ambiente Supabase: o schema `auth` com as funções
-- auth.uid()/auth.role() e os roles anon/authenticated (usados nas políticas de RLS e
-- nos GRANTs). Num Postgres comum esses objetos não existem, então os criamos aqui como
-- stubs ANTES de `prisma migrate deploy`. Não afetam os testes: o Prisma conecta como
-- superusuário e IGNORA o RLS — o shim só permite que as políticas sejam criadas.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
  $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
