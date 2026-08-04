// MARES — Helpers de exibição de solicitações de glossário (client).

import { txt } from "@/lib/catalog-i18n"
import { slugify } from "@/lib/slug"
import type { CatalogType } from "@/schemas/catalog.schema"
import type { CatalogRequestItem, CatalogRequestType } from "@/types/catalog-request"

export function catalogTypeOfRequest(t: CatalogRequestType): CatalogType {
  return t === "ORGAN" ? "organs" : t === "PATHOGEN" ? "pathogens" : "exam-types"
}

// Nome do item proposto na solicitação, no idioma ativo.
export function requestItemName(locale: string, req: CatalogRequestItem): string {
  const p = req.payload
  if (req.type === "PATHOGEN") {
    return p.scientificName || txt(locale, { pt: p.namePt, en: p.nameEn })
  }
  return txt(locale, { pt: p.namePt, en: p.nameEn })
}

// Nomes normalizados (sem acento/caixa) candidatos a colisão — usados para achar parecidos.
export function requestNormalizedNames(req: CatalogRequestItem): string[] {
  const p = req.payload
  const s = (v?: string | null) => (v && v.trim() ? slugify(v) : null)
  if (req.type === "PATHOGEN" && p.scientificName) return [s(p.scientificName)!].filter(Boolean)
  return [s(p.namePt), s(p.nameEn)].filter((x): x is string => !!x)
}
