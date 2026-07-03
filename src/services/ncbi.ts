// MARES — Serviço de busca taxonômica no NCBI Taxonomy (client, via proxy /api/ncbi).

import { http } from "@/lib/http"
import type { NcbiMatch } from "@/types/ncbi"

export const ncbiService = {
  search: (query: string, opts?: { signal?: AbortSignal }) =>
    http.get<NcbiMatch[]>(`/api/ncbi?q=${encodeURIComponent(query)}`, opts),
}
