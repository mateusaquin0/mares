// MARES — DTOs de Catálogos (itens nomeados e patógenos).

import type { I18nText } from "@/lib/catalog-i18n"

// Item de catálogo genérico (órgão, tipo de exame, etc.).
export type CatalogItem = { id: string; name: string | I18nText }

// Patógeno (pode ter nome científico e/ou nome do catálogo).
export type PathogenItem = {
  id: string
  scientificName: string | null
  name: string | I18nText | null
}

// ── Gestão de catálogos (CatalogManager) ─────────────────────────────────────
// `createdById` + `inUse` alimentam a permissão de editar/excluir (criador enquanto não usado).
export type NamedRow = {
  id: string
  key: string
  name: string | I18nText
  // Medida quantitativa (só exam-types; null para órgãos). Ver docs.
  measureLabel: string | I18nText | null
  measureUnit: string | null
  createdById: string | null
  inUse: boolean
}
export type GroupLite = {
  id: string
  key: string
  name: string | I18nText
  usesScientificName: boolean
}
export type PathogenRow = {
  id: string
  key: string
  scientificName: string | null
  name: string | I18nText | null
  taxonFamily: string | null
  taxonOrder: string | null
  taxonId: number | null
  createdById: string | null
  inUse: boolean
  group: GroupLite
}
export type CatalogRow = NamedRow | PathogenRow
