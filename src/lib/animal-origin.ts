// MARES — Origem da navegação até o detalhe do indivíduo.
//
// O detalhe é alcançado por três telas — lista de animais, grade de resultados e mapa — e o
// botão "voltar" precisa devolver a pessoa para onde ela estava (antes ele apontava sempre
// para a lista de animais, então quem vinha dos resultados perdia a grade).
//
// A origem viaja na URL (`?from=`), não no histórico do navegador: sobrevive a recarregar a
// página e a abrir o link numa aba nova, e um link direto (sem `from`, ou com um valor que não
// reconhecemos) cai na lista de animais.

export const ANIMAL_ORIGINS = {
  results: { href: "/app/results", labelKey: "backToResults" },
  map: { href: "/app/map", labelKey: "backToMap" },
} as const

export type AnimalOrigin = keyof typeof ANIMAL_ORIGINS

const ANIMALS_LIST = { href: "/app/animals", labelKey: "back" } as const

/** Link para o detalhe do indivíduo, marcando de onde a pessoa veio. */
export function animalHref(id: string, from?: AnimalOrigin): string {
  const path = `/app/animals/${encodeURIComponent(id)}`
  return from ? `${path}?from=${from}` : path
}

/** Destino do "voltar": a tela de origem, ou a lista de animais quando não há origem válida. */
export function animalBackTo(from: string | string[] | null | undefined): {
  href: string
  labelKey: string
} {
  // `hasOwn` e não indexação direta: o valor vem da URL, e nomes herdados de Object.prototype
  // ("constructor", "toString") passariam como origem e devolveriam um destino sem href.
  if (typeof from !== "string" || !Object.hasOwn(ANIMAL_ORIGINS, from)) return ANIMALS_LIST
  return ANIMAL_ORIGINS[from as AnimalOrigin]
}
