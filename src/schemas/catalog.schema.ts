import { z } from "zod"

// Catálogos globais. Órgão/Exame têm nome traduzível (pt+en). Patógeno tem nome científico
// único (latim) + grupo traduzível opcional. Mensagens = chaves do namespace `validation`.
export const CATALOG_TYPES = ["organs", "pathogens", "exam-types"] as const
export type CatalogType = (typeof CATALOG_TYPES)[number]

export function isCatalogType(v: string): v is CatalogType {
  return (CATALOG_TYPES as readonly string[]).includes(v)
}

// Órgão / Exame — rótulo por idioma.
export const nameI18nSchema = z.object({
  namePt: z.string().min(1, "required").max(255),
  nameEn: z.string().min(1, "required").max(255),
})

// Patógeno — nome científico + grupo (pt/en) opcional.
export const pathogenSchema = z.object({
  name: z.string().min(1, "required").max(255),
  groupPt: z.string().max(255).optional().or(z.literal("")),
  groupEn: z.string().max(255).optional().or(z.literal("")),
})

export function catalogBodySchema(type: CatalogType) {
  return type === "pathogens" ? pathogenSchema : nameI18nSchema
}

export type NameI18nData = z.infer<typeof nameI18nSchema>
export type PathogenData = z.infer<typeof pathogenSchema>
