import { z } from "zod"

import { optionalDate, optionalText } from "@/schemas/common"

// Mensagens = chaves do namespace `validation` (resolvidas no componente). Ver docs/I18N.md.

// Coordenadas opcionais, mas quando informadas devem estar em faixa válida.
const latitude = z.number({ error: "number" }).min(-90, "latRange").max(90, "latRange")
const longitude = z.number({ error: "number" }).min(-180, "lonRange").max(180, "lonRange")

export const animalBaseSchema = z.object({
  species: z.string().min(1, "required").max(255),
  // Preenchidos via WoRMS ao selecionar a espécie (opcionais; limpáveis).
  wormsAphiaId: z.number().int().nullable().optional(),
  taxonFamily: optionalText(120),
  taxonOrder: optionalText(120),
  controlId: optionalText(120),
  simbaRecordNumber: optionalText(120),
  sex: optionalText(40),
  lifeStage: optionalText(60),
  bodyCondition: optionalText(60),
  decompositionStage: optionalText(60),
  strandingLat: latitude.optional().nullable(),
  strandingLon: longitude.optional().nullable(),
  strandingBeach: optionalText(255),
  municipality: optionalText(120),
  state: optionalText(120),
  eventDate: optionalDate,
  macroscopicNotes: optionalText(4000),
  isPublic: z.boolean().optional(),
})

export const createAnimalSchema = animalBaseSchema.extend({
  researchId: z.string().min(1, "required"),
})

export const updateAnimalSchema = animalBaseSchema.partial()

export type CreateAnimalData = z.infer<typeof createAnimalSchema>
export type UpdateAnimalData = z.infer<typeof updateAnimalSchema>
