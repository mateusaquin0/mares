import { z } from "zod"

// Catálogos globais internacionalizados (Organ / Pathogen / ExamType).
// `group_*` só se aplica a Pathogen, mas o schema aceita para todos (ignorado quando N/A).
export const CATALOG_TYPES = ["organs", "pathogens", "exam-types"] as const
export type CatalogType = (typeof CATALOG_TYPES)[number]

export function isCatalogType(v: string): v is CatalogType {
  return (CATALOG_TYPES as readonly string[]).includes(v)
}

export const catalogCreateSchema = z.object({
  namePt: z.string().min(1, "required").max(255),
  nameEn: z.string().min(1, "required").max(255),
  groupPt: z.string().max(255).optional().or(z.literal("")),
  groupEn: z.string().max(255).optional().or(z.literal("")),
})

export const catalogUpdateSchema = z.object({
  namePt: z.string().min(1, "required").max(255).optional(),
  nameEn: z.string().min(1, "required").max(255).optional(),
  groupPt: z.string().max(255).optional().or(z.literal("")),
  groupEn: z.string().max(255).optional().or(z.literal("")),
})

export type CatalogCreateData = z.infer<typeof catalogCreateSchema>
export type CatalogUpdateData = z.infer<typeof catalogUpdateSchema>
