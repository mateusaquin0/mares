import { z } from "zod"

import { optionalNumber, optionalText } from "@/schemas/common"
import { LIMITS } from "@/schemas/limits"

// Resultado = enum Result do Prisma; null = "não testado" (limpa a célula).
export const resultSchema = z.enum(["POSITIVO", "NEGATIVO", "INCONCLUSIVO"])

// Upsert de uma célula da grade de análises (sample × pathogen × examType).
export const upsertAnalysisSchema = z.object({
  sampleId: z.string().min(1, "required"),
  pathogenId: z.string().min(1, "required"),
  examTypeId: z.string().min(1, "required"),
  result: resultSchema.nullable().optional(),
  measureValue: optionalNumber,
  notes: optionalText(LIMITS.longText),
})

export type UpsertAnalysisData = z.infer<typeof upsertAnalysisSchema>
export type ResultValue = z.infer<typeof resultSchema>
