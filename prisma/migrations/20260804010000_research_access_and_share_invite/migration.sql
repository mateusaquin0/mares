-- MARES — Catálogo de pesquisas + consentimento nos dois sentidos.
--
-- Problema resolvido: com o escopo por pesquisa (ResearchMember), um pesquisador que só
-- pertence à própria pesquisa não enxergava NENHUMA outra e, por isso, não conseguia
-- compartilhar um indivíduo — o seletor de destino vinha vazio.
--
-- Duas peças, ambas com consentimento explícito:
--   1. ResearchAccessRequest — a LISTAGEM de pesquisas passa a ser aberta a todo membro do
--      grupo (catálogo: nome/descrição/autor), mas os DADOS continuam restritos aos membros
--      da pesquisa. Quem quiser os dados pede acesso; quem gere a pesquisa aprova.
--   2. AnimalResearch.status/origin — o compartilhamento de indivíduo passa a exigir
--      consentimento dos dois lados. Nasce PENDING e vale só depois do aceite do lado que
--      ainda não consentiu: um CONVITE (origin INVITE, partiu de quem enxerga o indivíduo) é
--      respondido pela pesquisa convidada; um PEDIDO (origin REQUEST, partiu de quem quer o
--      indivíduo) é respondido pela pesquisa primária. Assim ninguém empurra dados para
--      dentro do escopo alheio nem se serve do escopo alheio.
--
-- Ver docs/PERMISSOES.md §Escopo por pesquisa e §Compartilhamento de indivíduo.

-- ─────────────────────────────────────────────────────────────
-- 1. Convite no compartilhamento de indivíduo
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "AnimalResearchStatus" AS ENUM ('PENDING', 'ACCEPTED');
CREATE TYPE "AnimalResearchOrigin" AS ENUM ('INVITE', 'REQUEST');

-- DEFAULT 'ACCEPTED' também faz o backfill: as participações que já existem foram criadas
-- quando o vínculo era imediato, então continuam valendo sem pedir aceite retroativo.
ALTER TABLE "AnimalResearch"
    ADD COLUMN "status" "AnimalResearchStatus" NOT NULL DEFAULT 'ACCEPTED',
    ADD COLUMN "origin" "AnimalResearchOrigin" NOT NULL DEFAULT 'INVITE',
    ADD COLUMN "invitedById" TEXT,
    ADD COLUMN "message" TEXT,
    ADD COLUMN "respondedAt" TIMESTAMP(3);

ALTER TABLE "AnimalResearch"
    ADD CONSTRAINT "AnimalResearch_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AnimalResearch_researchId_status_idx" ON "AnimalResearch"("researchId", "status");
CREATE INDEX "AnimalResearch_status_origin_idx" ON "AnimalResearch"("status", "origin");

-- ─────────────────────────────────────────────────────────────
-- 2. Solicitação de acesso a uma pesquisa
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "ResearchAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ResearchAccessRequest" (
    "id"           TEXT NOT NULL,
    "researchId"   TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "message"      TEXT,
    "status"       "ResearchAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchAccessRequest_pkey" PRIMARY KEY ("id")
);

-- Um pedido por par (repetir um pedido recusado reabre a MESMA linha).
CREATE UNIQUE INDEX "ResearchAccessRequest_researchId_userId_key"
    ON "ResearchAccessRequest"("researchId", "userId");
CREATE INDEX "ResearchAccessRequest_researchId_status_idx"
    ON "ResearchAccessRequest"("researchId", "status");
CREATE INDEX "ResearchAccessRequest_userId_idx" ON "ResearchAccessRequest"("userId");

ALTER TABLE "ResearchAccessRequest"
    ADD CONSTRAINT "ResearchAccessRequest_researchId_fkey"
    FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchAccessRequest"
    ADD CONSTRAINT "ResearchAccessRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchAccessRequest"
    ADD CONSTRAINT "ResearchAccessRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (defesa em profundidade — a aplicação usa Prisma/role postgres, que IGNORA RLS; ver
-- docs/POLITICAS_RLS.md). Habilita sempre; políticas só se a função auxiliar existir.
ALTER TABLE public."ResearchAccessRequest" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "ResearchAccessRequest" TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.user_org_id()') IS NOT NULL THEN
    -- Via Data API o usuário só enxerga os PRÓPRIOS pedidos. A fila de quem gere a pesquisa
    -- é servida pela aplicação (Prisma), que aplica canManageResearch.
    EXECUTE $p$
      CREATE POLICY "research_access_request_select_self" ON public."ResearchAccessRequest"
        FOR SELECT TO authenticated
        USING ("userId" = (SELECT auth.uid()::text))
    $p$;
    -- Só pode pedir acesso a pesquisa da própria organização, e em nome de si mesmo.
    EXECUTE $p$
      CREATE POLICY "research_access_request_insert_self" ON public."ResearchAccessRequest"
        FOR INSERT TO authenticated
        WITH CHECK (
          "userId" = (SELECT auth.uid()::text)
          AND EXISTS (
            SELECT 1 FROM public."Research" r
            WHERE r.id = "researchId" AND r."orgId" = public.user_org_id()
          )
        )
    $p$;
  END IF;
END
$$;
