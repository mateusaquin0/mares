// MARES — Hooks de dados de Catálogos (react-query sobre catalogService).

import { useQuery } from "@tanstack/react-query"

import { catalogService } from "@/services/catalog"

export const catalogKeys = {
  organs: () => ["catalog", "organs"] as const,
  pathogens: () => ["catalog", "pathogens"] as const,
  examTypes: () => ["catalog", "exam-types"] as const,
}

// Órgãos — dados praticamente estáticos (staleTime longo).
export function useOrgans() {
  return useQuery({
    queryKey: catalogKeys.organs(),
    queryFn: () => catalogService.listOrgans(),
    staleTime: 5 * 60_000,
  })
}
