-- MARES — Sistemas anatômicos deixam de ser constante em código e viram catálogo.
--
-- Motivo: o MARES cobre "qualquer espécie marinha — mamíferos, répteis, aves e peixes
-- costeiros" (docs/PROJETO_COMPLETO.md) e o WoRMS entra sem filtro de táxon. Os cinco
-- sistemas da entrega anterior eram neutros por acaso, mas cada grupo reporta estruturas que
-- não cabem numa lista fixa — sacos aéreos e siringe em ave, carapaça e glândula de sal em
-- tartaruga, brânquias e bexiga natatória em peixe. Ver docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.
--
--   `NecropsySystem` → catálogo global (aba nova do glossário). NASCE VAZIO: sem seed.
--   `NecropsySystemExam.system` (TEXT) → `systemId` (FK), + `position` para a ordem ser a do
--                      LAUDO (os catálogos ordenam por `key`, o que embaralha a anatômica).
--
-- SEM BACKFILL: a migration anterior já rodou em produção, mas o laudo que havia lá era
-- preenchimento de TESTE, e o autor do projeto autorizou descartá-lo (2026-08-24). Por isso
-- esta migration APAGA os pronunciamentos de sistema existentes em vez de religá-los a
-- linhas de catálogo — o que também deixa o catálogo nascer de fato vazio.
--
-- Se algum dia esta migration for aplicada a uma base com laudo REAL, o DELETE abaixo perde
-- dado: nesse caso, troque-o por um INSERT ... SELECT DISTINCT que crie um NecropsySystem
-- por chave em uso e religue `systemId` por ela, antes do SET NOT NULL.

-- ─────────────────────────────────────────────────────────────
-- 1. Catálogo de sistemas
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "NecropsySystem" (
    "id"            TEXT NOT NULL,
    "key"           TEXT NOT NULL,
    "name"          JSONB NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "NecropsySystem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NecropsySystem_key_key" ON "NecropsySystem"("key");
CREATE INDEX "NecropsySystem_created_by_id_idx" ON "NecropsySystem"("created_by_id");

-- ─────────────────────────────────────────────────────────────
-- 2. Solicitação de glossário passa a aceitar sistema
--
--    ALTER TYPE ... ADD VALUE roda em transação no PG 12+, mas o valor novo NÃO pode ser
--    USADO na mesma transação em que nasce. Aqui ele só é declarado — nenhuma linha desta
--    migration insere 'SYSTEM' —, então é seguro no mesmo arquivo.
-- ─────────────────────────────────────────────────────────────

ALTER TYPE "CatalogRequestType" ADD VALUE 'SYSTEM';

-- ─────────────────────────────────────────────────────────────
-- 3. NecropsySystemExam: chave de texto → FK do catálogo
-- ─────────────────────────────────────────────────────────────

-- DESTRUTIVO, e de propósito: descarta o laudo de teste (ver nota no cabeçalho). Os achados
-- macroscópicos caem junto pelo ON DELETE CASCADE de GrossFinding.
DELETE FROM "NecropsySystemExam";

ALTER TABLE "NecropsySystemExam" ADD COLUMN "systemId" TEXT NOT NULL;
ALTER TABLE "NecropsySystemExam" ADD COLUMN "position" INTEGER NOT NULL;

-- "Não avaliado" deixa de ser a ausência de LINHA (que era possível com a lista fixa de
-- cinco) e passa a ser a ausência de ESTADO: o sistema entra no laudo como item de
-- checklist e é preenchido depois.
ALTER TABLE "NecropsySystemExam" ALTER COLUMN "status" DROP NOT NULL;

-- Restrict (não Cascade): apagar um sistema que algum laudo usa apagaria o pronunciamento
-- junto. A checagem de "em uso" do glossário barra antes; o FK é a rede de segurança.
ALTER TABLE "NecropsySystemExam"
    ADD CONSTRAINT "NecropsySystemExam_systemId_fkey"
    FOREIGN KEY ("systemId") REFERENCES "NecropsySystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "NecropsySystemExam_animalId_system_key";
DROP INDEX IF EXISTS "NecropsySystemExam_animalId_idx";
ALTER TABLE "NecropsySystemExam" DROP COLUMN "system";

CREATE UNIQUE INDEX "NecropsySystemExam_animalId_systemId_key" ON "NecropsySystemExam"("animalId", "systemId");
CREATE INDEX "NecropsySystemExam_animalId_position_idx" ON "NecropsySystemExam"("animalId", "position");

-- ─────────────────────────────────────────────────────────────
-- 4. GRANTs + RLS
--
--    Mesmas policies dos demais catálogos globais (docs/POLITICAS_RLS.md §5): leitura para
--    authenticated e anon; escrita para admin de QUALQUER organização (`is_any_org_admin()`,
--    que já cobre o admin global); exclusão só para o admin global.
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public."NecropsySystem" TO authenticated;
GRANT SELECT ON public."NecropsySystem" TO anon;

ALTER TABLE public."NecropsySystem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "necropsy_system_select_auth" ON public."NecropsySystem" FOR SELECT TO authenticated USING (true);
CREATE POLICY "necropsy_system_select_anon" ON public."NecropsySystem" FOR SELECT TO anon          USING (true);

CREATE POLICY "necropsy_system_insert" ON public."NecropsySystem"
  FOR INSERT TO authenticated WITH CHECK (public.is_any_org_admin());

CREATE POLICY "necropsy_system_update" ON public."NecropsySystem"
  FOR UPDATE TO authenticated USING (public.is_any_org_admin()) WITH CHECK (public.is_any_org_admin());

CREATE POLICY "necropsy_system_delete" ON public."NecropsySystem"
  FOR DELETE TO authenticated USING (public.is_system_admin());
