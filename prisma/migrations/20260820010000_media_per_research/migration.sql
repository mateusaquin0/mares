-- MARES — Mídia passa a pertencer a uma PESQUISA (como a amostra), não ao indivíduo inteiro.
--
-- Até aqui a visibilidade do arquivo era a do indivíduo: num indivíduo COMPARTILHADO, quem
-- enxergava o indivíduo por qualquer pesquisa via as fotos/laudos de todas elas. Agora o
-- arquivo tem dona (AnimalMedia.researchId) e o escopo passa a ser o mesmo das amostras.

-- 1) Coluna nullable para o backfill.
ALTER TABLE "AnimalMedia" ADD COLUMN "researchId" TEXT;

-- 2) Backfill preferencial: a pesquisa DE QUEM ENVIOU o arquivo. Só resolve quando o autor é
--    membro de exatamente UMA das pesquisas do indivíduo (primária ∪ participações aceitas) —
--    caso contrário não há como saber por qual projeto o arquivo entrou.
--    Atribuir tudo à pesquisa primária jogaria para o projeto vizinho arquivos enviados por
--    quem só participa do indivíduo, e os esconderia justamente de quem os enviou.
WITH candidatas AS (
  SELECT m.id AS media_id, a."researchId" AS research_id, m."uploadedById" AS uploader
  FROM "AnimalMedia" m
  JOIN "Animal" a ON a.id = m."animalId"
  UNION
  SELECT m.id, ar."researchId", m."uploadedById"
  FROM "AnimalMedia" m
  JOIN "AnimalResearch" ar ON ar."animalId" = m."animalId" AND ar.status = 'ACCEPTED'
),
do_autor AS (
  SELECT c.media_id, c.research_id
  FROM candidatas c
  JOIN "ResearchMember" rm ON rm."researchId" = c.research_id AND rm."userId" = c.uploader
),
sem_ambiguidade AS (
  SELECT media_id, MIN(research_id) AS research_id
  FROM do_autor
  GROUP BY media_id
  HAVING COUNT(*) = 1
)
UPDATE "AnimalMedia" m
SET "researchId" = s.research_id
FROM sem_ambiguidade s
WHERE s.media_id = m.id;

-- 3) Resto (arquivo órfão, autor que saiu da pesquisa, ou autor em mais de uma pesquisa do
--    indivíduo): fica com a pesquisa PRIMÁRIA, que é a dona do indivíduo.
UPDATE "AnimalMedia" m
SET "researchId" = a."researchId"
FROM "Animal" a
WHERE a.id = m."animalId" AND m."researchId" IS NULL;

-- 4) Passa a ser obrigatória, com FK e índice.
ALTER TABLE "AnimalMedia" ALTER COLUMN "researchId" SET NOT NULL;
ALTER TABLE "AnimalMedia" ADD CONSTRAINT "AnimalMedia_researchId_fkey"
  FOREIGN KEY ("researchId") REFERENCES "Research"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AnimalMedia_researchId_idx" ON "AnimalMedia"("researchId");
