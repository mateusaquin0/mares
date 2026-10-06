import { z } from "zod"

import { LIMITS } from "@/schemas/limits"

// Catálogos globais. Órgão/Exame/Sistema têm nome traduzível (pt+en). Patógeno tem nome
// científico único (latim) + grupo traduzível opcional. Mensagens = chaves de `validation`.
export const CATALOG_TYPES = ["organs", "pathogens", "exam-types", "systems"] as const
export type CatalogType = (typeof CATALOG_TYPES)[number]

export function isCatalogType(v: string): v is CatalogType {
  return (CATALOG_TYPES as readonly string[]).includes(v)
}

// Ponte entre o tipo de catálogo (plural, usado nas rotas e na UI) e o enum
// `CatalogRequestType` do Prisma (singular, gravado no banco). Fonte ÚNICA: servidor, cliente
// e testes importam daqui. Vive neste módulo — sem Prisma — para poder ser importado dos dois
// lados. `satisfies` garante que nenhum CatalogType fique sem par.
export const REQUEST_TYPE_BY_CATALOG = {
  organs: "ORGAN",
  pathogens: "PATHOGEN",
  "exam-types": "EXAM_TYPE",
  systems: "SYSTEM",
} as const satisfies Record<CatalogType, string>

export type RequestTypeName = (typeof REQUEST_TYPE_BY_CATALOG)[CatalogType]

export const CATALOG_BY_REQUEST_TYPE = Object.fromEntries(
  Object.entries(REQUEST_TYPE_BY_CATALOG).map(([k, v]) => [v, k]),
) as Record<RequestTypeName, CatalogType>

// Órgão / Exame / Sistema — rótulo por idioma. `tinyText` porque são termos, não frases:
// "Encéfalo", "Sistema respiratório", "Imunohistoquímica (IHQ)". O nome científico do
// patógeno tem escala própria (pathogenSchema), que pode ser bem mais longo.
export const nameI18nSchema = z.object({
  namePt: z.string().min(1, "required").max(LIMITS.tinyText),
  nameEn: z.string().min(1, "required").max(LIMITS.tinyText),
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
  taxonRank: z.string().max(LIMITS.tinyText).optional().or(z.literal("")),
  taxonId: z.number().int().nullable().optional(),
})

export function catalogBodySchema(type: CatalogType) {
  return type === "pathogens" ? pathogenSchema : nameI18nSchema
}

export type NameI18nData = z.infer<typeof nameI18nSchema>
export type ExamTypeData = z.infer<typeof examTypeSchema>
export type PathogenData = z.infer<typeof pathogenSchema>
