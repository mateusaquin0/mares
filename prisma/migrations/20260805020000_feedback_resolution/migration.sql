-- MARES — Feedback: resposta ao autor + trilha de triagem.
--   `resolutionNote` é a justificativa/resposta VISÍVEL ao autor (obrigatória em WONT_FIX,
--   regra aplicada na aplicação); `adminNote` continua sendo a anotação interna do admin.
--   `reviewedById`/`reviewedAt` registram quem triou por último (sem FK, como CatalogRequest).

ALTER TABLE "Feedback" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Listagem "meus envios" (autor, mais novo → mais antigo).
CREATE INDEX "Feedback_createdById_createdAt_idx" ON "Feedback"("createdById", "createdAt");

-- RLS (defesa em profundidade — a aplicação usa Prisma/role postgres, que IGNORA RLS; ver
-- docs/POLITICAS_RLS.md). O autor passa a poder LER os próprios envios via Data API; a
-- política de admin (feedback_admin_all) segue valendo para leitura e escrita.
-- Atenção: a política é por linha, não por coluna — o recorte que esconde `adminNote` do
-- autor é feito no `select` do Prisma (src/lib/feedback.ts).
DO $$
BEGIN
  IF to_regprocedure('public.is_system_admin()') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY "feedback_select_own" ON public."Feedback"
        FOR SELECT TO authenticated
        USING ("createdById" = (SELECT auth.uid()::text))
    $p$;
  END IF;
END
$$;
