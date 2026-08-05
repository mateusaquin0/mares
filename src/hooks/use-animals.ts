// MARES — Hooks de dados de Animais (react-query sobre animalsService).
// Encapsulam cache/dedupe das requisições, evitando o double-fetch do
// useEffect manual (React Strict Mode) e centralizando as chaves de query.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { animalsService } from "@/services/animals"
import { pendingCountsKeys } from "@/hooks/use-pending-counts"
import type { CreateAnimalData, UpdateAnimalData } from "@/schemas/animal.schema"
import type { AnimalListQuery } from "@/types/animal"

export const animalKeys = {
  all: ["animals"] as const,
  list: (query: AnimalListQuery) => ["animals", query] as const,
  facets: () => ["animal-facets"] as const,
  detail: (id: string) => ["animal", id] as const,
  grid: (id: string) => ["animal-grid", id] as const,
  media: (id: string) => ["animal-media", id] as const,
  audit: (id: string) => ["animal-audit", id] as const,
  // Caixa de compartilhamentos pendentes (não é por animal: é do usuário).
  shares: () => ["animal-shares"] as const,
}

// Listagem paginada (server-side). Mantém a página anterior visível durante o refetch.
export function useAnimals(query: AnimalListQuery) {
  return useQuery({
    queryKey: animalKeys.list(query),
    queryFn: () => animalsService.list(query),
    placeholderData: keepPreviousData,
  })
}

// Facetas dos filtros (valores distintos do escopo do usuário).
export function useAnimalFacets() {
  return useQuery({
    queryKey: animalKeys.facets(),
    queryFn: () => animalsService.facets(),
  })
}

export function useAnimal(id: string, enabled = true) {
  return useQuery({
    queryKey: animalKeys.detail(id),
    queryFn: () => animalsService.get(id),
    enabled: enabled && !!id,
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

// ── Mutações ─────────────────────────────────────────────────────────────────

export function useCreateAnimal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAnimalData) => animalsService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: animalKeys.all })
      qc.invalidateQueries({ queryKey: animalKeys.facets() })
    },
  })
}

export function useUpdateAnimal(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAnimalData) => animalsService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: animalKeys.all })
      qc.invalidateQueries({ queryKey: animalKeys.facets() })
      qc.invalidateQueries({ queryKey: animalKeys.detail(id) })
    },
  })
}

export function useDeleteAnimal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => animalsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: animalKeys.all })
      qc.invalidateQueries({ queryKey: animalKeys.facets() })
    },
  })
}

// ── Compartilhamento do indivíduo entre pesquisas ────────────────────────────
// Toda mutação aqui mexe na caixa de pendências e na bolinha do menu, por isso
// invalidam também `animalKeys.shares` e `pendingCountsKeys`.

// Convida OU pede o indivíduo (o servidor decide a direção pelo escopo de quem chama).
export function useShareAnimal(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ researchId, message }: { researchId: string; message?: string }) =>
      animalsService.shareWithResearch(animalId, researchId, message),
    onSuccess: () => invalidateShares(qc, animalId),
  })
}

export function useAcceptAnimalShare(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (researchId: string) => animalsService.acceptShare(animalId, researchId),
    onSuccess: () => invalidateShares(qc, animalId),
  })
}

// Recusa, cancela ou desvincula — a autorização de cada caso fica no servidor.
export function useRemoveAnimalResearch(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (researchId: string) => animalsService.removeResearch(animalId, researchId),
    onSuccess: () => invalidateShares(qc, animalId),
  })
}

// Caixa de entrada: compartilhamentos aguardando a resposta do usuário (os dois sentidos).
export function usePendingShares() {
  return useQuery({
    queryKey: animalKeys.shares(),
    queryFn: () => animalsService.pendingShares(),
  })
}

function invalidateShares(qc: ReturnType<typeof useQueryClient>, animalId: string) {
  qc.invalidateQueries({ queryKey: animalKeys.detail(animalId) })
  qc.invalidateQueries({ queryKey: animalKeys.all })
  qc.invalidateQueries({ queryKey: animalKeys.shares() })
  qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
}

// Busca no SIMBA sob demanda (ação imperativa) — sem cache.
export function useSimbaLookup() {
  return useMutation({
    mutationFn: (recordNumber: string) => animalsService.lookupSimba(recordNumber),
  })
}

export function useUploadAnimalMedia(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (form: FormData) => animalsService.uploadMedia(animalId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: animalKeys.media(animalId) })
      qc.invalidateQueries({ queryKey: animalKeys.detail(animalId) })
    },
  })
}

export function useDeleteAnimalMedia(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) => animalsService.removeMedia(mediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: animalKeys.media(animalId) })
      qc.invalidateQueries({ queryKey: animalKeys.detail(animalId) })
    },
  })
}
