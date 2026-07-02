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
export type NamedRow = { id: string; key: string; name: string | I18nText }
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
  group: GroupLite
}
export type CatalogRow = NamedRow | PathogenRow
