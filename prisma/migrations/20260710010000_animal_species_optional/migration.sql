-- MARES — Espécie do animal passa a ser opcional (indeterminada). Carcaças não
-- identificáveis podem ser registradas sem espécie; no formulário o campo pode ser marcado
-- como "indeterminado" (mesmo padrão dos campos de encalhe). NULL = espécie indeterminada.

ALTER TABLE "Animal" ALTER COLUMN "species" DROP NOT NULL;
