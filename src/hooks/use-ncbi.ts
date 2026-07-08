// MARES — Hook de busca taxonômica no NCBI (typeahead). Devolve uma função de busca
// estável, mapeada para o formato do TaxonAutocomplete.

import { useCallback } from "react"

import { ncbiService } from "@/services/ncbi"

export function useNcbiSearch() {
  return useCallback(
    (q: string, opts: { signal: AbortSignal }) =>
      ncbiService.search(q, opts).then((rs) =>
        rs.map((r) => ({
          id: r.key,
          scientificName: r.scientificName,
          rank: r.rank,
          family: r.family,
          order: r.order,
        })),
      ),
    [],
  )
}
