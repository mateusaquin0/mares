-- MARES — Rank taxonômico do patógeno (docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md).
-- `taxon_rank` guarda o rank NCBI do próprio patógeno ("species", "genus", "family"…). Torna
-- determinística a decisão de "alvo amplo" (elegível a confirmação de espécie por sequenciamento),
-- sem depender de heurística sobre o texto do nome. Novos itens gravam o rank vindo do NCBI; aqui
-- fazemos o backfill dos registros existentes a partir do nome científico.

ALTER TABLE "Pathogen" ADD COLUMN "taxon_rank" TEXT;

-- Backfill lexical (best-effort) para o que já existe:
--   • "Sarcocystis sp." / "spp."      → genus
--   • token único terminado em família (-idae/-aceae/…) → family; em ordem (-ales) → order
--   • binômio "Genero especie"        → species
--   • sem nome científico (nome comum) → permanece NULL
-- A ordem dos ramos importa (o teste de "sp." vem antes do de espécie).
UPDATE "Pathogen" SET "taxon_rank" =
  CASE
    WHEN "scientific_name" IS NULL THEN NULL
    WHEN "scientific_name" ~* '(^| )spp?\.?$' THEN 'genus'
    WHEN "scientific_name" !~ ' ' AND "scientific_name" ~* '(idae|aceae|oidea|ineae|inae)$' THEN 'family'
    WHEN "scientific_name" !~ ' ' AND "scientific_name" ~* 'ales$' THEN 'order'
    WHEN "scientific_name" ~ ' ' THEN 'species'
    ELSE NULL
  END
WHERE "taxon_rank" IS NULL;
