import { z } from "zod"

import { optionalText, optionalDate } from "@/schemas/common"

// Mensagens = chaves do namespace `validation` (resolvidas no componente). Ver docs/I18N.md.

// Coordenadas obrigatórias, dentro da faixa válida. Vazio (null) → "required".
const latitude = z.number({ error: "required" }).min(-90, "latRange").max(90, "latRange")
const longitude = z.number({ error: "required" }).min(-180, "lonRange").max(180, "lonRange")
// Texto/data obrigatórios (não vazios após trim).
const requiredText = (max: number) => z.string().trim().min(1, "required").max(max)
const requiredDate = z
  .string()
  .trim()
  .min(1, "required")
  .refine((v) => !Number.isNaN(Date.parse(v)), "invalidDate")

export const animalBaseSchema = z.object({
  species: requiredText(255),
  // Preenchidos via WoRMS ao selecionar a espécie (opcionais; limpáveis).
  wormsAphiaId: z.number().int().nullable().optional(),
  taxonFamily: optionalText(120),
  taxonOrder: optionalText(120),
  controlId: requiredText(120),
  simbaRecordNumber: optionalText(120),
  sex: requiredText(40),
  lifeStage: requiredText(60),
  bodyCondition: optionalText(60),
  decompositionStage: optionalText(60),
  deathCondition: optionalText(60),
  necropsyDate: optionalDate,
  strandingLat: latitude,
  strandingLon: longitude,
  strandingBeach: optionalText(255),
  municipality: requiredText(120),
  state: requiredText(120),
  eventDate: requiredDate,
  macroscopicNotes: optionalText(4000),
  isPublic: z.boolean().optional(),
})

export const createAnimalSchema = animalBaseSchema.extend({
  researchId: z.string().min(1, "required"),
})

export const updateAnimalSchema = animalBaseSchema.partial()

export type CreateAnimalData = z.infer<typeof createAnimalSchema>
export type UpdateAnimalData = z.infer<typeof updateAnimalSchema>
