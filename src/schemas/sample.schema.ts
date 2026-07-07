import { z } from "zod"

import { optionalDate, optionalNumber, optionalText } from "@/schemas/common"

// Mensagens = chaves do namespace `validation`. Valores de status = enum SampleStatus do Prisma.

export const sampleStatusSchema = z.enum(["STORED", "IN_USE", "DEPLETED", "DEGRADED"])

export const createSampleSchema = z.object({
  // Pesquisa dona da amostra (uma das pesquisas do indivíduo). Ver docs/BANCO_DE_DADOS.md.
  researchId: z.string().min(1, "required"),
  organId: z.string().min(1, "required"),
  identification: z.string().min(1, "required").max(255),
  sampleType: z.string().min(1, "required").max(255),
  collectionDate: optionalDate,
  storageLocation: optionalText(255),
  storageTemp: optionalNumber,
  status: sampleStatusSchema.optional(),
  notes: optionalText(2000),
})

export const updateSampleSchema = createSampleSchema.partial()

export type CreateSampleData = z.infer<typeof createSampleSchema>
export type UpdateSampleData = z.infer<typeof updateSampleSchema>
export type SampleStatusValue = z.infer<typeof sampleStatusSchema>
