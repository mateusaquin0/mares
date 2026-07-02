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
