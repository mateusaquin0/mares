-- MARES — Desativação de grupos de pesquisa (Organization) que ficam sem membros.
-- Um grupo userless é DESATIVADO (deactivatedAt = data), não excluído; seus dados públicos
-- permanecem visíveis no mapa público. Readicionar um membro reativa (deactivatedAt = NULL).
-- Ver docs/CADASTRO_E_ACESSO.md e docs/PERMISSOES.md.

ALTER TABLE "Organization" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
