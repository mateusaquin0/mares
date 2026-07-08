-- MARES — Feedback (sugestões e relatos de bug) enviados por usuários autenticados;
-- visíveis e geridos pelo admin global. Ver plano da feature.

CREATE TYPE "FeedbackType" AS ENUM ('SUGGESTION', 'BUG');
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED', 'WONT_FIX');

CREATE TABLE "Feedback" (
    "id"             TEXT NOT NULL,
    "type"           "FeedbackType" NOT NULL,
    "title"          TEXT NOT NULL,
    "message"        TEXT NOT NULL,
    "pageUrl"        TEXT,
    "status"         "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "adminNote"      TEXT,
    "createdById"    TEXT,
    "createdByEmail" TEXT NOT NULL,
    "orgId"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

ALTER TABLE "Feedback"
    ADD CONSTRAINT "Feedback_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (defesa em profundidade — a aplicação usa Prisma/role postgres, que IGNORA RLS; ver
-- docs/POLITICAS_RLS.md). Habilita RLS sempre; as políticas via Data API só são criadas se a
-- função auxiliar existir neste banco (não falha onde o RLS não foi provisionado).
ALTER TABLE public."Feedback" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('public.is_system_admin()') IS NOT NULL THEN
    -- Qualquer usuário autenticado pode enviar feedback.
    EXECUTE $p$
      CREATE POLICY "feedback_insert" ON public."Feedback"
        FOR INSERT TO authenticated
        WITH CHECK (true)
    $p$;
    -- Apenas o admin global lê/gerencia os feedbacks.
    EXECUTE $p$
      CREATE POLICY "feedback_admin_all" ON public."Feedback"
        FOR ALL TO authenticated
        USING (public.is_system_admin())
        WITH CHECK (public.is_system_admin())
    $p$;
  END IF;
END
$$;
