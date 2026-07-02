// MARES — Hooks de dados de Animais (react-query sobre animalsService).
// Encapsulam cache/dedupe das requisições, evitando o double-fetch do
// useEffect manual (React Strict Mode) e centralizando as chaves de query.

import { useQuery } from "@tanstack/react-query"

import { animalsService } from "@/services/animals"

export const animalKeys = {
  list: (researchId?: string) => ["animals", researchId ?? null] as const,
  detail: (id: string) => ["animal", id] as const,
  grid: (id: string) => ["animal-grid", id] as const,
  media: (id: string) => ["animal-media", id] as const,
  audit: (id: string) => ["animal-audit", id] as const,
}

export function useAnimals(researchId?: string) {
  return useQuery({
    queryKey: animalKeys.list(researchId),
    queryFn: () => animalsService.list(researchId),
  })
}

export function useAnimal(id: string) {
  return useQuery({
    queryKey: animalKeys.detail(id),
    queryFn: () => animalsService.get(id),
  })
}

export function useAnimalGrid(animalId: string) {
  return useQuery({
    queryKey: animalKeys.grid(animalId),
    queryFn: () => animalsService.getGrid(animalId),
  })
}

export function useAnimalMedia(animalId: string) {
  return useQuery({
    queryKey: animalKeys.media(animalId),
    queryFn: () => animalsService.listMedia(animalId),
  })
}

export function useAnimalAudit(animalId: string) {
  return useQuery({
    queryKey: animalKeys.audit(animalId),
    queryFn: () => animalsService.getAudit(animalId),
  })
}
