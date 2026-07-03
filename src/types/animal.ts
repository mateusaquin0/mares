// MARES — DTOs do domínio Animais (respostas da API consumidas no cliente).

import type { I18nText } from "@/lib/catalog-i18n"

// Opção de pesquisa usada nos formulários de animal.
export type ResearchLite = { id: string; name: string }

// Item da listagem de animais (/api/animals).
export type AnimalListItem = {
  id: string
  controlId: string | null
  simbaRecordNumber: string | null
  species: string
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  eventDate: string | null
  isPublic: boolean
  research: { id: string; name: string }
  _count: { samples: number }
}

// Detalhe completo de um animal (/api/animals/:id).
export type AnimalDetail = {
  id: string
  species: string
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
export type AuditEntry = {
  id: string
  changedAt: string
  field: string
  oldValue: string | null
  newValue: string | null
  author: string
  pathogen: { scientificName: string | null; name: string | I18nText | null } | null
  examType: { name: string | I18nText } | null
  organ: { name: string | I18nText } | null
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
