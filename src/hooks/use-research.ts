// MARES — Hooks de dados de Pesquisas (react-query sobre researchService).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { researchService, type ProtocolEntryInput } from "@/services/research"
import { pendingCountsKeys } from "@/hooks/use-pending-counts"
import type { CreateResearchData, UpdateResearchData } from "@/schemas/research.schema"

export const researchKeys = {
  all: ["research"] as const,
  list: () => ["research"] as const,
  catalog: () => ["research-catalog"] as const,
  accessRequests: () => ["research-access-requests"] as const,
  detail: (id: string) => ["research", id] as const,
  members: (id: string) => ["research", id, "members"] as const,
  results: (id: string) => ["research", id, "results"] as const,
}

// Pesquisas do ESCOPO do usuário — as que ele pode usar para gravar dados (seletores de
// cadastro, filtros, resultados). Não confundir com o catálogo abaixo.
export function useResearchList() {
  return useQuery({
    queryKey: researchKeys.list(),
    queryFn: () => researchService.list(),
  })
}

// Catálogo: TODAS as pesquisas do grupo (metadados), com isMember/requestStatus. Usado na
// tela de pesquisas e no seletor de destino do compartilhamento de indivíduo.
export function useResearchCatalog() {
  return useQuery({
    queryKey: researchKeys.catalog(),
    queryFn: () => researchService.catalog(),
  })
}

export function useResearch(id: string, enabled = true) {
  return useQuery({
    queryKey: researchKeys.detail(id),
    queryFn: () => researchService.get(id),
    enabled: enabled && !!id,
  })
}

export function useResearchResults(id: string, enabled = true) {
  return useQuery({
    queryKey: researchKeys.results(id),
    queryFn: () => researchService.results(id),
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

export function useSetProtocolStatus(researchId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: "ACTIVE" | "INACTIVE" }) =>
      researchService.setProtocolStatus(researchId, entryId, status),
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

// ── Pedidos de acesso a uma pesquisa ─────────────────────────────────────────

export function useRequestResearchAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ researchId, message }: { researchId: string; message?: string }) =>
      researchService.requestAccess(researchId, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: researchKeys.catalog() }),
  })
}

// Fila de pedidos que o usuário pode revisar (pesquisas que ele gere).
export function useAccessRequests() {
  return useQuery({
    queryKey: researchKeys.accessRequests(),
    queryFn: () => researchService.accessRequests(),
  })
}

export function useReviewAccessRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      researchService.reviewAccessRequest(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: researchKeys.accessRequests() })
      // Aprovar cria um vínculo: muda o escopo do solicitante e a lista de membros.
      qc.invalidateQueries({ queryKey: researchKeys.all })
      qc.invalidateQueries({ queryKey: researchKeys.catalog() })
      qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
    },
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

// Sair de uma pesquisa (auto-remoção do vínculo). Diferente de remover outra pessoa, isto
// muda o ESCOPO de quem chamou: a pesquisa some dos seletores e os animais/amostras dela
// deixam de aparecer. Por isso limpa o cache de todo o domínio, não só a lista de membros.
export function useLeaveResearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ researchId, userId }: { researchId: string; userId: string }) =>
      researchService.removeMember(researchId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: researchKeys.all })
      qc.invalidateQueries({ queryKey: researchKeys.catalog() })
      qc.invalidateQueries({ queryKey: ["animals"] })
      qc.invalidateQueries({ queryKey: ["animal-facets"] })
      qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
    },
  })
}
