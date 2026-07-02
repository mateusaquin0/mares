// MARES — Hooks de dados de Catálogos (react-query sobre catalogService).

import { useQuery } from "@tanstack/react-query"

import { catalogService } from "@/services/catalog"
import type { CatalogType } from "@/schemas/catalog.schema"

export const catalogKeys = {
  organs: () => ["catalog", "organs"] as const,
  pathogens: () => ["catalog", "pathogens"] as const,
  examTypes: () => ["catalog", "exam-types"] as const,
  list: (type: CatalogType) => ["catalog", type] as const,
  groups: () => ["pathogen-groups"] as const,
}

// Atalhos por tipo (dados praticamente estáticos). `enabled` permite condicionar
// o carregamento (ex.: só para admin da org).
export function useOrgans(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.organs(),
    queryFn: () => catalogService.listOrgans(),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function usePathogens(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.pathogens(),
    queryFn: () => catalogService.listPathogens(),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useExamTypes(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.examTypes(),
    queryFn: () => catalogService.listExamTypes(),
    staleTime: 5 * 60_000,
    enabled,
  })
}

// Gestão genérica de catálogos (CatalogManager): lista por tipo e grupos de patógeno.
export function useCatalogList(type: CatalogType) {
  return useQuery({
    queryKey: catalogKeys.list(type),
    queryFn: () => catalogService.list(type),
    staleTime: 60_000,
  })
}

export function usePathogenGroups(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.groups(),
    queryFn: () => catalogService.listPathogenGroups(),
    staleTime: Infinity,
    enabled,
  })
}
