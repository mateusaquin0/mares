import { z } from "zod"

import { optionalText, optionalDate } from "@/schemas/common"
import { LIMITS } from "@/schemas/limits"
import { SEX_VALUES, LIFE_STAGE_VALUES } from "@/lib/animal-enums"

// Mensagens = chaves do namespace `validation` (resolvidas no componente). Ver docs/I18N.md.

// Campos de encalhe (data, local, coordenadas) são OPCIONAIS no servidor: podem ser
// marcados como "sem informação" no formulário. A obrigatoriedade padrão é aplicada no
// cliente (ver use-animal-form), permitindo pular cada campo individualmente. Quando
// presentes, coordenadas são validadas na faixa.
const latitude = z.number().min(-90, "latRange").max(90, "latRange").nullable().optional()
const longitude = z.number().min(-180, "lonRange").max(180, "lonRange").nullable().optional()
// Texto obrigatório (não vazio após trim).
const requiredText = (max: number) => z.string().trim().min(1, "required").max(max)

export const animalBaseSchema = z.object({
  species: requiredText(LIMITS.name),
  // Preenchidos via WoRMS ao selecionar a espécie (opcionais; limpáveis).
  wormsAphiaId: z.number().int().nullable().optional(),
  taxonFamily: optionalText(LIMITS.shortText),
  taxonOrder: optionalText(LIMITS.shortText),
  controlId: requiredText(LIMITS.shortText),
  simbaRecordNumber: optionalText(LIMITS.shortText),
  // Valores fixos do domínio (bloqueia texto livre); vazio/ inválido → "required".
  sex: z.enum(SEX_VALUES, { error: "required" }),
  lifeStage: z.enum(LIFE_STAGE_VALUES, { error: "required" }),
  bodyCondition: optionalText(LIMITS.tinyText),
  decompositionStage: optionalText(LIMITS.tinyText),
  deathCondition: optionalText(LIMITS.tinyText),
  necropsyDate: optionalDate,
  strandingLat: latitude,
  strandingLon: longitude,
  strandingBeach: optionalText(LIMITS.name),
  municipality: optionalText(LIMITS.shortText),
  state: optionalText(LIMITS.shortText),
  eventDate: optionalDate,
  macroscopicNotes: optionalText(LIMITS.hugeText),
  isPublic: z.boolean().optional(),
})

export const createAnimalSchema = animalBaseSchema.extend({
  researchId: z.string().min(1, "required"),
})

export const updateAnimalSchema = animalBaseSchema.partial()

export type CreateAnimalData = z.infer<typeof createAnimalSchema>
export type UpdateAnimalData = z.infer<typeof updateAnimalSchema>
