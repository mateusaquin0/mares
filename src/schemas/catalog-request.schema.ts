import { z } from "zod"

import { LIMITS } from "@/schemas/limits"
import {
  CATALOG_TYPES,
  type CatalogType,
  nameI18nSchema,
  examTypeSchema,
  pathogenSchema,
} from "@/schemas/catalog.schema"

// Valida o payload da solicitação conforme o tipo (mesmas regras da criação direta).
// Diferente de catalogBodySchema: aqui exam-types usa examTypeSchema (com medida).
export function catalogRequestPayloadSchema(type: CatalogType) {
  return type === "pathogens"
    ? pathogenSchema
    : type === "exam-types"
      ? examTypeSchema
      : nameI18nSchema
}

// Corpo do POST de solicitação. O payload é revalidado por tipo no servidor.
export const createCatalogRequestSchema = z.object({
  type: z.enum(CATALOG_TYPES),
  payload: z.record(z.string(), z.unknown()),
})

// Corpo da rejeição — motivo opcional.
export const rejectCatalogRequestSchema = z.object({
  note: z.string().max(LIMITS.longText).optional().or(z.literal("")),
})

export type CreateCatalogRequestData = z.infer<typeof createCatalogRequestSchema>
