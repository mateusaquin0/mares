-- MARES — Adiciona o campo `title` ao Feedback (título curto do relato/sugestão).
-- Migration separada porque a 20260708000000_feedback já havia sido aplicada.
-- DEFAULT '' garante a adição mesmo se houver linhas existentes; em seguida o default é
-- removido para casar com o schema (title obrigatório, sem valor padrão).

ALTER TABLE "Feedback" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Feedback" ALTER COLUMN "title" DROP DEFAULT;
