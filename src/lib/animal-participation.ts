// MARES — Cláusulas de participação de pesquisa num indivíduo (AnimalResearch).
//
// Um indivíduo pode ser estudado por várias pesquisas da mesma organização, mas a
// participação nasce como CONVITE (status PENDING) e só concede visibilidade depois que
// alguém da pesquisa de destino ACEITA. Como esse filtro precisa valer em TODO caminho de
// leitura (listagem, mapa, export, escopo, conflito de identificador), ele mora aqui — um
// módulo puro (só tipos do Prisma), fácil de importar em qualquer camada e de testar.
//
// Ver docs/PERMISSOES.md §Compartilhamento de indivíduo.

import { Prisma } from "@prisma/client"

/** Filtro do vínculo efetivo: convite pendente NÃO conta como participação. */
export const ACCEPTED_PARTICIPATION = { status: "ACCEPTED" } as const

/**
 * Cláusula "o indivíduo é compartilhado com alguma destas pesquisas (já aceito)".
 * Combine com `{ researchId: { in: ids } }` num OR para obter o conjunto efetivo
 * (pesquisa primária ∪ participações aceitas).
 */
export function sharedWithResearches(researchIds: string[]): Prisma.AnimalWhereInput {
  return {
    participations: { some: { researchId: { in: researchIds }, ...ACCEPTED_PARTICIPATION } },
  }
}

/** OR pronto do conjunto efetivo de pesquisas de um indivíduo. */
export function inResearches(researchIds: string[]): Prisma.AnimalWhereInput[] {
  return [{ researchId: { in: researchIds } }, sharedWithResearches(researchIds)]
}

// ── Ocultação por pesquisa ─────────────────────────────────────────────────────
//
// Ocultar tira o indivíduo da LISTAGEM, do MAPA e do DASHBOARD daquela pesquisa, sem apagar
// nada. O acesso (`inResearches`) continua valendo: é por ele que se abre o detalhe para
// reexibir, e é ele que barra o recadastro do mesmo identificador.

/**
 * OR do conjunto efetivo descontadas as pesquisas que ocultaram o indivíduo (sem ids =
 * listado em ALGUMA pesquisa, o recorte do admin).
 */
export function listedInResearches(researchIds?: string[]): Prisma.AnimalWhereInput[] {
  const inIds = researchIds ? { researchId: { in: researchIds } } : {}
  return [
    { ...inIds, primaryHiddenAt: null },
    { participations: { some: { ...inIds, ...ACCEPTED_PARTICIPATION, hiddenAt: null } } },
  ]
}

/** OR "alguma destas pesquisas ocultou o indivíduo" (sem ids = qualquer pesquisa). */
export function hiddenInResearches(researchIds?: string[]): Prisma.AnimalWhereInput[] {
  const inIds = researchIds ? { researchId: { in: researchIds } } : {}
  return [
    { ...inIds, primaryHiddenAt: { not: null } },
    { participations: { some: { ...inIds, ...ACCEPTED_PARTICIPATION, hiddenAt: { not: null } } } },
  ]
}
