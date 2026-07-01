-- MARES — Normaliza o grupo de patógeno numa tabela própria (vocabulário controlado) e separa
-- nome científico (universal) de nome comum traduzível. Converte os dados existentes.

-- 1. Tabela de grupos.
CREATE TABLE "PathogenGroup" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" JSONB NOT NULL,
  "uses_scientific_name" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "PathogenGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PathogenGroup_key_key" ON "PathogenGroup"("key");

-- 2. Grupos fixos (vocabulário controlado).
INSERT INTO "PathogenGroup" ("id","key","name","uses_scientific_name") VALUES
  (gen_random_uuid(), 'bacteria',      '{"pt":"Bactérias","en":"Bacteria"}',                 true),
  (gen_random_uuid(), 'fungi',         '{"pt":"Fungos","en":"Fungi"}',                       true),
  (gen_random_uuid(), 'protozoa',      '{"pt":"Protozoários","en":"Protozoa"}',              true),
  (gen_random_uuid(), 'viruses',       '{"pt":"Vírus","en":"Viruses"}',                      true),
  (gen_random_uuid(), 'helminths',     '{"pt":"Helmintos","en":"Helminths"}',                true),
  (gen_random_uuid(), 'anthropogenic', '{"pt":"Ações antrópicas","en":"Anthropogenic actions"}', false);

-- 3. Novas colunas em Pathogen.
ALTER TABLE "Pathogen" ADD COLUMN "group_id" TEXT;
ALTER TABLE "Pathogen" ADD COLUMN "scientific_name" TEXT;
ALTER TABLE "Pathogen" ADD COLUMN "name_new" JSONB;

-- 4. Mapeia o grupo antigo (jsonb->pt) para o novo grupo.
UPDATE "Pathogen" p SET "group_id" = g.id
FROM "PathogenGroup" g
WHERE g.key = CASE p."group"->>'pt'
  WHEN 'Bactéria' THEN 'bacteria'
  WHEN 'Fungo' THEN 'fungi'
  WHEN 'Protozoário Sarcocistídeo' THEN 'protozoa'
  WHEN 'Vírus' THEN 'viruses'
  WHEN 'Helminto' THEN 'helminths'
  WHEN 'Antropogênico' THEN 'anthropogenic'
END;

-- 5. Grupos científicos: name antigo -> scientific_name. Ações antrópicas: name antigo -> name
--    (jsonb; o inglês é corrigido depois pelo seed, que é a fonte de verdade).
UPDATE "Pathogen" p SET "scientific_name" = p."name"
FROM "PathogenGroup" g WHERE p."group_id" = g.id AND g.uses_scientific_name = true;

UPDATE "Pathogen" p SET "name_new" = jsonb_build_object('pt', p."name", 'en', p."name")
FROM "PathogenGroup" g WHERE p."group_id" = g.id AND g.uses_scientific_name = false;

-- 6. Remove colunas antigas, renomeia e aplica constraints.
ALTER TABLE "Pathogen" DROP COLUMN "name";
ALTER TABLE "Pathogen" DROP COLUMN "group";
ALTER TABLE "Pathogen" RENAME COLUMN "name_new" TO "name";
ALTER TABLE "Pathogen" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "Pathogen"
  ADD CONSTRAINT "Pathogen_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "PathogenGroup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Pathogen_group_id_idx" ON "Pathogen"("group_id");
