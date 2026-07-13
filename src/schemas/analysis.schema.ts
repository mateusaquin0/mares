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

// ── Confirmação de espécie por sequenciamento ────────────────────────────────
// Um rastreio POSITIVO recebe análises-filhas (parentAnalysisId): espécie resolvida
// (pathogenId) + exame de sequenciamento (examTypeId) + registros de sequência.
// Ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md.

// Rastro de UM sequenciamento (marcador/acesso/% identidade). Todos os campos são opcionais:
// o registro documenta o que se sabe da sequência que sustentou a espécie.
export const sequenceRecordSchema = z.object({
  marker: optionalText(LIMITS.shortText),
  accession: optionalText(LIMITS.shortText),
  pctIdentity: optionalNumber,
  consensus: optionalText(LIMITS.hugeText),
  platform: optionalText(LIMITS.tinyText),
})

// Máximo de sequências por confirmação (guarda de sanidade; múltiplos marcadores por espécie).
export const MAX_SEQUENCES_PER_CONFIRMATION = 20

export const upsertConfirmationSchema = z.object({
  pathogenId: z.string().min(1, "required"),
  examTypeId: z.string().min(1, "required"),
  // POSITIVO = espécie confirmada; INCONCLUSIVO = leitura sem qualidade. Default POSITIVO.
  result: resultSchema.nullable().optional(),
  notes: optionalText(LIMITS.longText),
  sequences: z
    .array(sequenceRecordSchema)
    .max(MAX_SEQUENCES_PER_CONFIRMATION)
    .optional()
    .default([]),
})

export type SequenceRecordData = z.infer<typeof sequenceRecordSchema>
export type UpsertConfirmationData = z.infer<typeof upsertConfirmationSchema>
