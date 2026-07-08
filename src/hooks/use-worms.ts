// MARES — Hook de busca taxonômica no WoRMS (typeahead). Devolve uma função de
// busca estável, mapeada para o formato do TaxonAutocomplete.

import { useCallback } from "react"

import { wormsService } from "@/services/worms"

export function useWormsSearch() {
  return useCallback(
    (q: string, opts: { signal: AbortSignal }) =>
      wormsService.search(q, opts).then((rs) =>
        rs.map((r) => ({
          id: r.aphiaId,
          scientificName: r.scientificName,
          rank: r.rank,
          family: r.family,
          order: r.order,
        })),
      ),
    [],
  )
}
