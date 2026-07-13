// MARES — Hooks de Solicitações de glossário (react-query).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { catalogRequestService } from "@/services/catalog-request"
import { pendingCountsKeys } from "@/hooks/use-pending-counts"
import type { CatalogItemPayload } from "@/services/catalog"
import type { CatalogType } from "@/schemas/catalog.schema"

export const catalogRequestKeys = {
  all: ["catalog-requests"] as const,
  reviewable: (status: string) => ["catalog-requests", "reviewable", status] as const,
  mine: () => ["catalog-requests", "mine"] as const,
}

// Abrir solicitação (pesquisador).
export function useCreateCatalogRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { type: CatalogType; payload: CatalogItemPayload }) =>
      catalogRequestService.create(vars.type, vars.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogRequestKeys.mine() }),
  })
}

// Fila de curadoria (admin de grupo / global). Default: pendentes.
export function useReviewableRequests(status = "PENDING", enabled = true) {
  return useQuery({
    queryKey: catalogRequestKeys.reviewable(status),
    queryFn: () => catalogRequestService.listReviewable(status),
    enabled,
  })
}

// Minhas solicitações.
export function useMyRequests(enabled = true) {
  return useQuery({
    queryKey: catalogRequestKeys.mine(),
    queryFn: () => catalogRequestService.listMine(),
    enabled,
  })
}

export function useApproveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => catalogRequestService.approve(id),
    // Item novo entrou no glossário + fila mudou + bolinha de pendências do menu.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: catalogRequestKeys.all })
      qc.invalidateQueries({ queryKey: ["catalog"] })
      qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
    },
  })
}

export function useRejectRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; note?: string }) =>
      catalogRequestService.reject(vars.id, vars.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: catalogRequestKeys.all })
      qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
    },
  })
}
