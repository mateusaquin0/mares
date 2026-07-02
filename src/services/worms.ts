// MARES — Serviço de busca taxonômica no WoRMS (client, via proxy /api/worms).

import { http } from "@/lib/http"
import type { WormsMatch } from "@/types/worms"

export const wormsService = {
  search: (query: string, init?: RequestInit) =>
    http.get<WormsMatch[]>(`/api/worms?q=${encodeURIComponent(query)}`, init),
}
