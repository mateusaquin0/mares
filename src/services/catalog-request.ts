// MARES — Serviço de Solicitações de glossário (client).

import { http } from "@/lib/http"
import type { CatalogType } from "@/schemas/catalog.schema"
import type { CatalogItemPayload } from "@/services/catalog"
import type { CatalogRequestItem } from "@/types/catalog-request"

export const catalogRequestService = {
  // Abrir solicitação (pesquisador).
  create: (type: CatalogType, payload: CatalogItemPayload) =>
    http.post("/api/catalog-requests", { type, payload }),
  // Fila de curadoria (admin de grupo / global).
  listReviewable: (status?: string) =>
    http.get<CatalogRequestItem[]>("/api/catalog-requests", {
      params: status ? { status } : undefined,
    }),
  // Minhas solicitações (qualquer usuário).
  listMine: () => http.get<CatalogRequestItem[]>("/api/catalog-requests/mine"),
  approve: (id: string) => http.post<{ createdItemId: string }>(`/api/catalog-requests/${id}/approve`),
  reject: (id: string, note?: string) =>
    http.post(`/api/catalog-requests/${id}/reject`, { note: note ?? "" }),
}
