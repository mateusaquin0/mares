// MARES — Serviço de Animais (client). Encapsula as chamadas a /api/animals/* e
// endpoints relacionados (mídia, grade de análises, auditoria, SIMBA).

import { http } from "@/lib/http"
import type { CreateAnimalData, UpdateAnimalData } from "@/schemas/animal.schema"
import type {
  AnimalDetail,
  AnimalFacets,
  AnimalListPage,
  AnimalListQuery,
  AnimalMedia,
  AuditEntry,
  IdentifierLookup,
  PendingShare,
  ShareStatus,
  SimbaLookup,
} from "@/types/animal"
import type { AnalysisGrid } from "@/types/analysis"

// Monta a query string da listagem a partir do estado de filtros/ordenação/paginação.
// Arrays viram valores separados por vírgula; vazios/padrões são omitidos.
function animalListQS(q: AnimalListQuery, extra?: Record<string, string>): string {
  const p = new URLSearchParams()
  if (q.q) p.set("q", q.q)
  for (const key of ["species", "sex", "lifeStage", "state", "research", "pathogen"] as const) {
    if (q[key].length) p.set(key, q[key].join(","))
  }
  if (q.visibility !== "all") p.set("visibility", q.visibility)
  if (q.samples !== "all") p.set("samples", q.samples)
  if (q.from) p.set("from", q.from)
  if (q.to) p.set("to", q.to)
  p.set("sort", q.sort)
  p.set("dir", q.dir)
  p.set("page", String(q.page))
  p.set("pageSize", String(q.pageSize))
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v)
  return p.toString()
}

export const animalsService = {
  list: (query: AnimalListQuery) => http.get<AnimalListPage>(`/api/animals?${animalListQS(query)}`),
  facets: () => http.get<AnimalFacets>("/api/animals/facets"),
  // Ids de TODO o conjunto que casa com os filtros (para "selecionar todos" + exportar).
  ids: (query: AnimalListQuery) =>
    http.get<{ ids: string[] }>(`/api/animals?${animalListQS(query, { idsOnly: "1" })}`),
  get: (id: string) => http.get<AnimalDetail>(`/api/animals/${id}`),
  create: (data: CreateAnimalData) =>
    http.post<{ id: string; species: string }>("/api/animals", data),
  update: (id: string, data: UpdateAnimalData) =>
    http.put<{ id: string; species: string }>(`/api/animals/${id}`, data),
  remove: (id: string) => http.del(`/api/animals/${id}`),

  // Compartilhamento do indivíduo entre pesquisas. A DIREÇÃO (convite × pedido) é decidida
  // no servidor a partir do escopo de quem chama — o cliente só diz a pesquisa envolvida.
  shareWithResearch: (animalId: string, researchId: string, message?: string) =>
    http.post<{ status: ShareStatus }>(`/api/animals/${animalId}/researches`, {
      researchId,
      message: message ?? "",
    }),
  acceptShare: (animalId: string, researchId: string) =>
    http.patch(`/api/animals/${animalId}/researches/${researchId}`),
  // Serve para recusar, cancelar o que se pediu e desvincular uma participação já aceita.
  removeResearch: (animalId: string, researchId: string) =>
    http.del(`/api/animals/${animalId}/researches/${researchId}`),
  pendingShares: () => http.get<PendingShare[]>("/api/animal-shares"),

  // Confere se um identificador já existe na organização ANTES de preencher o formulário.
  lookupIdentifier: (by: { controlId?: string; simbaRecordNumber?: string }) => {
    const p = new URLSearchParams()
    if (by.controlId) p.set("controlId", by.controlId)
    if (by.simbaRecordNumber) p.set("simbaRecordNumber", by.simbaRecordNumber)
    return http.get<IdentifierLookup>(`/api/animals/lookup?${p.toString()}`)
  },

  // SIMBA — busca por número de registro (pré-preenchimento do formulário).
  lookupSimba: (recordNumber: string) =>
    http.get<SimbaLookup>(`/api/simba?record_number=${encodeURIComponent(recordNumber)}`),

  // Mídia
  listMedia: (animalId: string) => http.get<AnimalMedia[]>(`/api/animals/${animalId}/media`),
  uploadMedia: (animalId: string, form: FormData) =>
    http.postForm<AnimalMedia>(`/api/animals/${animalId}/media`, form),
  removeMedia: (mediaId: string) => http.del(`/api/media/${mediaId}`),

  // Grade de análises e auditoria
  getGrid: (animalId: string) => http.get<AnalysisGrid>(`/api/animals/${animalId}/grid`),
  getAudit: (animalId: string) => http.get<AuditEntry[]>(`/api/animals/${animalId}/audit`),
}
