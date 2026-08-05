// MARES — Regra de exclusão por autoria (amostras e mídia).
//
// Ver docs/PERMISSOES.md §Amostras e §Mídia. Predicado puro para valer igual nos dois lados: as
// rotas passam o papel resolvido por orgRole(), as telas passam os props isOrgAdmin/selfId.

/**
 * Pode excluir o registro: o admin da organização, o próprio autor, ou qualquer um quando o
 * registro está ÓRFÃO (`authorId` nulo).
 *
 * Órfão acontece em dois casos: registros anteriores às colunas de autoria (migrations
 * 20260805000000/20260805010000, parcialmente recuperados pelo backfill de 20260806000000) e
 * registros cujo autor foi removido do sistema — as FKs são ON DELETE SET NULL. Nos dois, não
 * há dono, e a decisão passa a ser de quem enxerga a pesquisa.
 *
 * ATENÇÃO: isto NÃO checa vínculo com a pesquisa. Quem chama é responsável por isso — nas rotas,
 * assertResearchVisible()/assertAnimalVisible(); nas telas, o próprio acesso à aba do indivíduo.
 */
export function canDeleteAuthored(p: {
  isOrgAdmin: boolean
  selfId: string | null
  authorId: string | null
}): boolean {
  return p.isOrgAdmin || p.authorId === null || p.authorId === p.selfId
}
