-- MARES — Solicitações de inclusão no glossário (organs/pathogens/exam-types).
-- Um pesquisador propõe um item; qualquer admin de grupo OU admin global aprova
-- (fila única). Ao aprovar, o item é criado pela mesma lógica da criação direta.
-- Ver docs/GLOSSARIO_SOLICITACOES.md.

CREATE TYPE "CatalogRequestType" AS ENUM ('ORGAN', 'PATHOGEN', 'EXAM_TYPE');
CREATE TYPE "CatalogRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "CatalogRequest" (
    "id"               TEXT NOT NULL,
    "type"             "CatalogRequestType" NOT NULL,
    "payload"          JSONB NOT NULL,
    "status"           "CatalogRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById"    TEXT,
    "requestedByEmail" TEXT NOT NULL,
    "orgId"            TEXT,
    "orgName"          TEXT,
    "reviewedById"     TEXT,
    "reviewedAt"       TIMESTAMP(3),
    "reviewNote"       TEXT,
    "duplicateOfId"    TEXT,
    "createdItemId"    TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatalogRequest_status_createdAt_idx" ON "CatalogRequest"("status", "createdAt");
CREATE INDEX "CatalogRequest_requestedById_idx" ON "CatalogRequest"("requestedById");

ALTER TABLE "CatalogRequest"
    ADD CONSTRAINT "CatalogRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (defesa em profundidade — a aplicação usa Prisma/role postgres, que IGNORA RLS; ver
-- docs/POLITICAS_RLS.md). Habilita sempre; políticas via Data API só se a função auxiliar existir.
ALTER TABLE public."CatalogRequest" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('public.is_system_admin()') IS NOT NULL THEN
    -- Qualquer usuário autenticado pode abrir uma solicitação.
    EXECUTE $p$
      CREATE POLICY "catalog_request_insert" ON public."CatalogRequest"
        FOR INSERT TO authenticated
        WITH CHECK (true)
    $p$;
    -- Leitura/gestão via Data API: apenas o admin global (a curadoria por org admin passa
    -- pela aplicação via Prisma). Defesa em profundidade.
    EXECUTE $p$
      CREATE POLICY "catalog_request_admin_all" ON public."CatalogRequest"
        FOR ALL TO authenticated
        USING (public.is_system_admin())
        WITH CHECK (public.is_system_admin())
    $p$;
  END IF;
END
$$;
