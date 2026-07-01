-- MARES — Autor da pesquisa (para a regra "pesquisador edita a própria criação").
ALTER TABLE "Research" ADD COLUMN "createdById" TEXT;

ALTER TABLE "Research"
  ADD CONSTRAINT "Research_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Research_createdById_idx" ON "Research"("createdById");
