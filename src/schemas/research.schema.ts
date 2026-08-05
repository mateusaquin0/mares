import { z } from "zod"

import { LIMITS } from "@/schemas/limits"

// Mensagens = chaves do namespace `validation` (resolvidas no componente). Ver docs/I18N.md.

export const protocolEntrySchema = z.object({
  organId: z.string().min(1),
  pathogenId: z.string().min(1),
  examTypeId: z.string().min(1),
})

export const createResearchSchema = z.object({
  name: z.string().min(3, "min3").max(LIMITS.name),
  description: z.string().max(LIMITS.longText).optional().or(z.literal("")),
  isPublic: z.boolean().optional(),
  protocols: z.array(protocolEntrySchema).optional(),
})

export const updateResearchSchema = z.object({
  name: z.string().min(3, "min3").max(LIMITS.name).optional(),
  description: z.string().max(LIMITS.longText).optional().or(z.literal("")),
  isPublic: z.boolean().optional(),
})

export const protocolEntriesSchema = z.object({
  entries: z.array(protocolEntrySchema).min(1),
})

// Ativa/desativa uma entrada de protocolo (ver docs/PLANO_PROTOCOLO_ANALISES.md).
export const patchProtocolSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
})

// Vincula um pesquisador (já membro da org) à pesquisa.
export const addResearchMemberSchema = z.object({
  userId: z.string().min(1),
})

// Pedido de acesso a uma pesquisa do grupo (justificativa opcional).
export const requestResearchAccessSchema = z.object({
  message: z.string().trim().max(LIMITS.longText).optional().or(z.literal("")),
})

// Decisão sobre um pedido de acesso.
export const reviewAccessRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
})

export type CreateResearchData = z.infer<typeof createResearchSchema>
export type UpdateResearchData = z.infer<typeof updateResearchSchema>
export type ProtocolEntry = z.infer<typeof protocolEntrySchema>
export type PatchProtocolData = z.infer<typeof patchProtocolSchema>
export type RequestResearchAccessData = z.infer<typeof requestResearchAccessSchema>
