// MARES — Serviço do Dashboard (client). Busca os dados agregados de /api/dashboard.

import { http } from "@/lib/http"
import type { DashboardData, DashboardFilters } from "@/lib/dashboard"

function query(f: DashboardFilters): string {
  const sp = new URLSearchParams()
  if (f.researchId) sp.set("researchId", f.researchId)
  if (f.pathogenId) sp.set("pathogenId", f.pathogenId)
  if (f.from) sp.set("from", f.from)
  if (f.to) sp.set("to", f.to)
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}

export const dashboardService = {
  get: (f: DashboardFilters) => http.get<DashboardData>(`/api/dashboard${query(f)}`),
}
