-- MARES — Unicidade da célula de análise separada por natureza da linha.
--
-- O índice único antigo cobria (sampleId, pathogenId, examTypeId) sem olhar parent_analysis_id.
-- Como a CONFIRMAÇÃO de espécie mora na mesma amostra e pode repetir o par (patógeno, exame),
-- ela podia ocupar o slot do RASTREIO que a grade exibe: o lançamento da célula ia gravar na
-- linha da confirmação, que a grade não mostra — e a alteração parecia não salvar, para sempre.
--
-- Agora são dois índices parciais, um por natureza. Índice parcial não é representável no
-- schema.prisma (mesma convenção de Pathogen_sci_key), então o código trata P2002: ver
-- createScreening em src/app/api/analyses/route.ts e asDuplicate em src/lib/confirmations.ts.
--
-- Sem risco para os dados existentes: cada índice novo cobre um SUBCONJUNTO das linhas que o
-- índice antigo já mantinha únicas.

DROP INDEX "Analysis_sampleId_pathogenId_examTypeId_key";

-- Rastreio: no máximo um por (amostra, patógeno, exame) — é a célula da grade.
CREATE UNIQUE INDEX "Analysis_screening_cell_key"
  ON "Analysis" ("sampleId", "pathogenId", "examTypeId")
  WHERE "parent_analysis_id" IS NULL;

-- Confirmação: a mesma espécie + exame não se repete na amostra ("espécie já confirmada").
CREATE UNIQUE INDEX "Analysis_confirmation_cell_key"
  ON "Analysis" ("sampleId", "pathogenId", "examTypeId")
  WHERE "parent_analysis_id" IS NOT NULL;
