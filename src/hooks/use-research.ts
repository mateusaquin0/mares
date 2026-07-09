// MARES — Hooks de dados de Pesquisas (react-query sobre researchService).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { researchService, type ProtocolEntryInput } from "@/services/research"
import type { CreateResearchData, UpdateResearchData } from "@/schemas/research.schema"

export const researchKeys = {
  all: ["research"] as const,
  list: () => ["research"] as const,
  detail: (id: string) => ["research", id] as const,
  members: (id: string) => ["research", id, "members"] as const,
}

export function useResearchList() {
  return useQuery({
    queryKey: researchKeys.list(),
    queryFn: () => researchService.list(),
  })
}

export function useResearch(id: string, enabled = true) {
  return useQuery({
    queryKey: researchKeys.detail(id),
    queryFn: () => researchService.get(id),
    enabled: enabled && !!id,
  })
}

// ── Mutações ─────────────────────────────────────────────────────────────────

export function useCreateResearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateResearchData) => researchService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.all }),
  })
}

export function useUpdateResearch(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateResearchData) => researchService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: researchKeys.all })
      qc.invalidateQueries({ queryKey: researchKeys.detail(id) })
    },
  })
}

export function useDeleteResearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => researchService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.all }),
  })
}

export function useAddProtocol(researchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entries: ProtocolEntryInput[]) => researchService.addProtocol(researchId, entries),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.detail(researchId) }),
  })
}

export function useRemoveProtocol(researchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => researchService.removeProtocol(researchId, entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.detail(researchId) }),
  })
}

// ── Membros da pesquisa ──────────────────────────────────────────────────────

export function useResearchMembers(id: string) {
  return useQuery({
    queryKey: researchKeys.members(id),
    queryFn: () => researchService.members(id),
  })
}

export function useAddResearchMember(researchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => researchService.addMember(researchId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.members(researchId) }),
  })
}

export function useRemoveResearchMember(researchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => researchService.removeMember(researchId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.members(researchId) }),
  })
}
