-- MARES — Topografia do achado macroscópico deixa de ser texto corrido, e o vínculo
-- órgão↔sistema sai.
--
-- 1) `GrossFinding.topography` guardava o caminho inteiro em uma string
--    ("Tecido cutâneo e subcutâneo/derme/epiderme/região ventral"), repetindo o SISTEMA que
--    já vem do exame pai. Vira topografia estruturada DENTRO do sistema:
--      `organId` → FK do catálogo. É o que faz macro e micro apontarem para o mesmo
--                  vocabulário. OPCIONAL: nem todo achado tem órgão definido (pode ser do
--                  sistema como um todo) e o catálogo pode ainda não ter o item.
--      `tissue` / `site` → texto livre, que é o que de fato são ("derme/epiderme",
--                  "região ventral"). Não são termos de catálogo.
--
-- 2) `OrganSystem` (N:N órgão↔sistema) foi criada na migration anterior e é removida aqui.
--    Justificava-se por três ganhos; só o mais fraco existia — filtrar o combobox de órgão
--    no diálogo do micro —, e ele nascia inerte porque sistema é criado sem órgãos. Volta se
--    a agregação por sistema for implementada. Ver docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.
--
-- Sem backfill: não havia achado macroscópico gravado, e os vínculos existentes eram de
-- teste — o autor do projeto confirmou o descarte (2026-08-24). Numa base com dado real,
-- `topography` precisaria ser lido e repartido antes do DROP.

-- ─────────────────────────────────────────────────────────────
-- 1. Topografia estruturada
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "GrossFinding" DROP COLUMN "topography",
  ADD COLUMN "organId" TEXT,
  ADD COLUMN "tissue"  TEXT,
  ADD COLUMN "site"    TEXT;

CREATE INDEX "GrossFinding_organId_idx" ON "GrossFinding"("organId");

-- Restrict, como em HistopathologyFinding: apagar um órgão citado por um laudo destruiria a
-- localização do achado. (SET NULL, o padrão do Prisma para relação opcional, faria isso em
-- silêncio.) A checagem de "em uso" do glossário barra antes; o FK é a rede de segurança.
ALTER TABLE "GrossFinding"
  ADD CONSTRAINT "GrossFinding_organId_fkey"
  FOREIGN KEY ("organId") REFERENCES "Organ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 2. Fora o vínculo órgão↔sistema
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "OrganSystem" DROP CONSTRAINT "OrganSystem_organId_fkey";
ALTER TABLE "OrganSystem" DROP CONSTRAINT "OrganSystem_systemId_fkey";

DROP TABLE "OrganSystem";
