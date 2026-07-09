// MARES — Hook de dados do Dashboard (react-query sobre dashboardService).

import { useQuery } from "@tanstack/react-query"

import { dashboardService } from "@/services/dashboard"
import type { DashboardFilters } from "@/lib/dashboard"

export const dashboardKeys = {
  all: ["dashboard"] as const,
  data: (f: DashboardFilters) =>
    ["dashboard", f.researchId ?? null, f.pathogenId ?? null, f.from ?? null, f.to ?? null] as const,
}

export function useDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.data(filters),
    queryFn: () => dashboardService.get(filters),
    placeholderData: (prev) => prev, // mantém os gráficos enquanto refaz a busca ao trocar filtro
  })
}
