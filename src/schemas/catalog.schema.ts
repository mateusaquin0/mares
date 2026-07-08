import { z } from "zod"

import { LIMITS } from "@/schemas/limits"

// Catálogos globais. Órgão/Exame têm nome traduzível (pt+en). Patógeno tem nome científico
// único (latim) + grupo traduzível opcional. Mensagens = chaves do namespace `validation`.
export const CATALOG_TYPES = ["organs", "pathogens", "exam-types"] as const
export type CatalogType = (typeof CATALOG_TYPES)[number]

export function isCatalogType(v: string): v is CatalogType {
  return (CATALOG_TYPES as readonly string[]).includes(v)
}

// Órgão / Exame — rótulo por idioma.
export const nameI18nSchema = z.object({
  namePt: z.string().min(1, "required").max(LIMITS.name),
  nameEn: z.string().min(1, "required").max(LIMITS.name),
})

// Tipo de exame = nome + medida quantitativa opcional (Ct, Título, OD...). measurePt/measureEn
// vazios = exame só qualitativo. measureUnit é uma anotação curta opcional.
export const examTypeSchema = nameI18nSchema.extend({
  measurePt: z.string().max(LIMITS.tinyText).optional().or(z.literal("")),
  measureEn: z.string().max(LIMITS.tinyText).optional().or(z.literal("")),
  measureUnit: z.string().max(LIMITS.measureUnit).optional().or(z.literal("")),
})

// Patógeno — grupo (FK) + nome científico OU nome comum (pt/en). O servidor valida quais
// campos são obrigatórios conforme o grupo (usesScientificName).
export const pathogenSchema = z.object({
  groupId: z.string().min(1, "required"),
  scientificName: z.string().max(LIMITS.name).optional().or(z.literal("")),
  namePt: z.string().max(LIMITS.name).optional().or(z.literal("")),
  nameEn: z.string().max(LIMITS.name).optional().or(z.literal("")),
  // Táxon (NCBI) — preenchido pelo autocomplete do nome científico.
  taxonFamily: z.string().max(LIMITS.shortText).optional().or(z.literal("")),
  taxonOrder: z.string().max(LIMITS.shortText).optional().or(z.literal("")),
  taxonId: z.number().int().nullable().optional(),
})

export function catalogBodySchema(type: CatalogType) {
  return type === "pathogens" ? pathogenSchema : nameI18nSchema
}

export type NameI18nData = z.infer<typeof nameI18nSchema>
export type ExamTypeData = z.infer<typeof examTypeSchema>
export type PathogenData = z.infer<typeof pathogenSchema>
