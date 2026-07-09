// MARES — DTOs do domínio Animais (respostas da API consumidas no cliente).

import type { I18nText } from "@/lib/catalog-i18n"

// Opção de pesquisa usada nos formulários de animal.
export type ResearchLite = { id: string; name: string }

// Item da listagem de animais (/api/animals).
export type AnimalListItem = {
  id: string
  controlId: string | null
  simbaRecordNumber: string | null
  species: string | null
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  eventDate: string | null
  isPublic: boolean
  // isPublic da pesquisa primária: visibilidade pública efetiva = isPublic && research.isPublic.
  research: { id: string; name: string; isPublic: boolean }
  // Conjunto efetivo de pesquisas do indivíduo (primária + participações). Usado no filtro.
  researches: { id: string; name: string }[]
  _count: { samples: number }
  // Patógenos com ao menos um resultado POSITIVO (nomes já resolvidos por locale).
  positivePathogens: string[]
}

// Colunas ordenáveis da listagem (compartilhado cliente/servidor).
export type AnimalSortKey =
  "control" | "species" | "sex" | "location" | "date" | "isPublic" | "samples" | "research"

// Estado da consulta da listagem (filtros + ordenação + paginação), controlado no cliente.
export type AnimalListQuery = {
  q: string
  species: string[]
  sex: string[]
  lifeStage: string[]
  state: string[]
  research: string[]
  pathogen: string[]
  visibility: "all" | "public" | "private"
  samples: "all" | "with" | "without"
  from: string
  to: string
  sort: AnimalSortKey
  dir: "asc" | "desc"
  page: number
  pageSize: number
}

// Resposta paginada de /api/animals.
export type AnimalListPage = {
  items: AnimalListItem[]
  total: number
  page: number
  pageSize: number
}

// Facetas dos filtros (/api/animals/facets): valores distintos do escopo do usuário.
export type AnimalFacets = {
  species: string[]
  states: string[]
  researches: { id: string; name: string }[]
  pathogens: { id: string; label: string }[]
}

// Detalhe completo de um animal (/api/animals/:id).
export type AnimalDetail = {
  id: string
  species: string | null
  wormsAphiaId: number | null
  taxonFamily: string | null
  taxonOrder: string | null
  controlId: string | null
  simbaRecordNumber: string | null
  sex: string | null
  lifeStage: string | null
  bodyCondition: string | null
  decompositionStage: string | null
  deathCondition: string | null
  necropsyDate: string | null
  strandingLat: number | null
  strandingLon: number | null
  strandingBeach: string | null
  municipality: string | null
  state: string | null
  eventDate: string | null
  macroscopicNotes: string | null
  isPublic: boolean
  research: { id: string; name: string }
  // Pesquisas adicionais (mesma org) que compartilham este indivíduo.
  participations: { research: { id: string; name: string } }[]
  _count: { samples: number; media: number }
}

// Mídia de um animal (/api/animals/:id/media).
export type AnimalMedia = {
  id: string
  url: string | null
  mimeType: string
  label: string | null
  createdAt: string
}

// Entrada do histórico/auditoria (/api/animals/:id/audit).
// `entity` distingue a origem: edição do animal, criação/edição de amostra ou análise.
export type AuditEntry = {
  id: string
  entity: "Animal" | "Sample" | "Analysis"
  changedAt: string
  field: string
  oldValue: string | null
  newValue: string | null
  author: string
  pathogen: { scientificName: string | null; name: string | I18nText | null } | null
  examType: { name: string | I18nText } | null
  organ: { name: string | I18nText } | null
  sample: { identification: string } | null
}

// Resposta do proxy do SIMBA (/api/simba) — usada no pré-preenchimento do formulário.
export type SimbaLookup = {
  simbaRecordNumber: string
  species: string | null
  wormsAphiaId: number | null
  taxonFamily: string | null
  taxonOrder: string | null
  eventDate: string | null
  necropsyDate: string | null
  strandingLat: number | null
  strandingLon: number | null
  strandingBeach: string | null
  municipality: string | null
  state: string | null
  sex: string
  lifeStage: string
  macroscopicNotes: string | null
}
