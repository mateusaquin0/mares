-- MARES — Identificação da amostra passa a ser única POR PESQUISA (não por organização).
--
-- O rótulo da amostra é derivado do indivíduo (ex.: "150/23 FIG" = ID de controle + órgão).
-- Num indivíduo COMPARTILHADO, cada pesquisa mantém as suas próprias amostras (Sample.researchId),
-- e as duas chegam ao mesmo rótulo para o mesmo órgão. Com a unicidade por organização, a
-- segunda pesquisa era barrada por uma amostra que ela sequer enxerga — erro sem saída.
--
-- É um RELAXAMENTO: dentro de uma pesquisa o orgId é constante, então tudo que satisfazia
-- (orgId, identification) satisfaz (researchId, identification). Nenhum dado precisa de ajuste.
--
-- O índice de `researchId` sai: o único composto abaixo já atende as consultas que filtram
-- por pesquisa (prefixo do índice).

DROP INDEX "Sample_orgId_identification_key";
DROP INDEX "Sample_researchId_idx";
CREATE UNIQUE INDEX "Sample_researchId_identification_key" ON "Sample"("researchId", "identification");
