-- MARES — Identificador SIMBA do animal passa a ser único POR ORGANIZAÇÃO (não global).
-- Alinha o simbaRecordNumber ao mesmo escopo já aplicado ao controlId: o mesmo indivíduo
-- pode ser cadastrado em outro grupo/pesquisa. Troca o índice único global pelo composto
-- (orgId, simbaRecordNumber). NULLs continuam não conflitando entre si.

DROP INDEX "Animal_simbaRecordNumber_key";
CREATE UNIQUE INDEX "Animal_orgId_simbaRecordNumber_key" ON "Animal"("orgId", "simbaRecordNumber");
