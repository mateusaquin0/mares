import { z } from "zod"

// Mensagens = chaves do namespace `validation` (resolvidas no componente). Ver docs/I18N.md.

export const protocolEntrySchema = z.object({
  organId: z.string().min(1),
  pathogenId: z.string().min(1),
  examTypeId: z.string().min(1),
})

export const createResearchSchema = z.object({
  name: z.string().min(3, "min3").max(255),
  description: z.string().max(2000).optional().or(z.literal("")),
  isPublic: z.boolean().optional(),
  protocols: z.array(protocolEntrySchema).optional(),
})

export const updateResearchSchema = z.object({
  name: z.string().min(3, "min3").max(255).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  isPublic: z.boolean().optional(),
})

export const protocolEntriesSchema = z.object({
  entries: z.array(protocolEntrySchema).min(1),
})

export type CreateResearchData = z.infer<typeof createResearchSchema>
export type UpdateResearchData = z.infer<typeof updateResearchSchema>
export type ProtocolEntry = z.infer<typeof protocolEntrySchema>
