-- MARES — Ticket de feedback vira conversa, com anexos de imagem.
--   `FeedbackMessage`   → mensagens trocadas entre quem reportou e a administração.
--   `FeedbackAttachment`→ imagens do relato original (messageId nulo) ou de uma mensagem.
--   `Feedback.authorReadAt` / `adminReadAt` → marcadores de leitura, um por LADO da
--   conversa (não por usuário), para o indicador de "tem mensagem nova do outro lado".
-- Ver docs/FEEDBACK.md.

CREATE TYPE "FeedbackParty" AS ENUM ('AUTHOR', 'ADMIN');

ALTER TABLE "Feedback" ADD COLUMN "authorReadAt" TIMESTAMP(3);
ALTER TABLE "Feedback" ADD COLUMN "adminReadAt"  TIMESTAMP(3);

CREATE TABLE "FeedbackMessage" (
    "id"             TEXT NOT NULL,
    "feedbackId"     TEXT NOT NULL,
    "body"           TEXT NOT NULL,
    "party"          "FeedbackParty" NOT NULL,
    "createdById"    TEXT,
    "createdByEmail" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

-- Leitura da conversa: sempre por ticket, mais antiga → mais nova.
CREATE INDEX "FeedbackMessage_feedbackId_createdAt_idx" ON "FeedbackMessage"("feedbackId", "createdAt");

ALTER TABLE "FeedbackMessage"
    ADD CONSTRAINT "FeedbackMessage_feedbackId_fkey"
    FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackMessage"
    ADD CONSTRAINT "FeedbackMessage_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FeedbackAttachment" (
    "id"              TEXT NOT NULL,
    "feedbackId"      TEXT NOT NULL,
    -- Nulo = anexo do relato original; preenchido = anexo de uma mensagem da conversa.
    "messageId"       TEXT,
    "url"             TEXT NOT NULL,
    "mimeType"        TEXT NOT NULL,
    "filename"        TEXT NOT NULL,
    "size"            INTEGER NOT NULL,
    "uploadedById"    TEXT,
    "uploadedByParty" "FeedbackParty" NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");
CREATE INDEX "FeedbackAttachment_messageId_idx"  ON "FeedbackAttachment"("messageId");

ALTER TABLE "FeedbackAttachment"
    ADD CONSTRAINT "FeedbackAttachment_feedbackId_fkey"
    FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackAttachment"
    ADD CONSTRAINT "FeedbackAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "FeedbackMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackAttachment"
    ADD CONSTRAINT "FeedbackAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (defesa em profundidade — a aplicação usa Prisma/role postgres, que IGNORA RLS; ver
-- docs/POLITICAS_RLS.md). As duas tabelas herdam a visibilidade do ticket: admin global vê
-- tudo; o autor vê (e escreve) apenas dentro dos próprios tickets. As regras de negócio que
-- a Data API não expressa — conversa fechada em RESOLVED/WONT_FIX, papel congelado no
-- envio — continuam sendo aplicadas na aplicação (src/lib/feedback.ts).
ALTER TABLE public."FeedbackMessage"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedbackAttachment" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('public.is_system_admin()') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY "feedback_message_admin_all" ON public."FeedbackMessage"
        FOR ALL TO authenticated
        USING (public.is_system_admin())
        WITH CHECK (public.is_system_admin())
    $p$;
    EXECUTE $p$
      CREATE POLICY "feedback_message_select_own" ON public."FeedbackMessage"
        FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public."Feedback" f
          WHERE f."id" = "feedbackId" AND f."createdById" = (SELECT auth.uid()::text)
        ))
    $p$;
    -- O autor só escreve como AUTHOR, e só no próprio ticket.
    EXECUTE $p$
      CREATE POLICY "feedback_message_insert_own" ON public."FeedbackMessage"
        FOR INSERT TO authenticated
        WITH CHECK (
          "party" = 'AUTHOR'
          AND EXISTS (
            SELECT 1 FROM public."Feedback" f
            WHERE f."id" = "feedbackId" AND f."createdById" = (SELECT auth.uid()::text)
          )
        )
    $p$;

    EXECUTE $p$
      CREATE POLICY "feedback_attachment_admin_all" ON public."FeedbackAttachment"
        FOR ALL TO authenticated
        USING (public.is_system_admin())
        WITH CHECK (public.is_system_admin())
    $p$;
    EXECUTE $p$
      CREATE POLICY "feedback_attachment_select_own" ON public."FeedbackAttachment"
        FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public."Feedback" f
          WHERE f."id" = "feedbackId" AND f."createdById" = (SELECT auth.uid()::text)
        ))
    $p$;
    EXECUTE $p$
      CREATE POLICY "feedback_attachment_insert_own" ON public."FeedbackAttachment"
        FOR INSERT TO authenticated
        WITH CHECK (
          "uploadedByParty" = 'AUTHOR'
          AND EXISTS (
            SELECT 1 FROM public."Feedback" f
            WHERE f."id" = "feedbackId" AND f."createdById" = (SELECT auth.uid()::text)
          )
        )
    $p$;
    -- Excluir o próprio anexo (a aplicação ainda exige que o ticket esteja aberto).
    EXECUTE $p$
      CREATE POLICY "feedback_attachment_delete_own" ON public."FeedbackAttachment"
        FOR DELETE TO authenticated
        USING ("uploadedById" = (SELECT auth.uid()::text))
    $p$;
  END IF;
END
$$;

-- Reabertura pedida pelo AUTOR de um ticket encerrado (RESOLVED/WONT_FIX). É um status à
-- parte, e não uma volta a NEW/IN_REVIEW, para a fila do admin distinguir "chegou agora"
-- de "quem reportou não concorda com o encerramento". Só o autor o produz.
ALTER TYPE "FeedbackStatus" ADD VALUE 'REOPENED';
