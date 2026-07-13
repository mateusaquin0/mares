// MARES — Serviço das contagens de pendências (client) para o indicador do menu.

import { http } from "@/lib/http"
import type { PendingCounts } from "@/app/api/pending-counts/route"

export const pendingCountsService = {
  get: () => http.get<PendingCounts>("/api/pending-counts"),
}
