// MARES — Hooks de dados de Pesquisas (react-query sobre researchService).

import { useQuery } from "@tanstack/react-query"

import { researchService } from "@/services/research"

export const researchKeys = {
  list: () => ["research"] as const,
  detail: (id: string) => ["research", id] as const,
}

export function useResearchList() {
  return useQuery({
    queryKey: researchKeys.list(),
    queryFn: () => researchService.list(),
  })
}

export function useResearch(id: string) {
  return useQuery({
    queryKey: researchKeys.detail(id),
    queryFn: () => researchService.get(id),
  })
}
