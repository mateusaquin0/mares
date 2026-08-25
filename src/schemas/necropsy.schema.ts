import { z } from "zod"

import { optionalText } from "@/schemas/common"
import { LIMITS } from "@/schemas/limits"
import { DISTRIBUTION_VALUES, NECROPSY_STATUS_VALUES, SEVERITY_VALUES } from "@/lib/necropsy-enums"

// Mensagens = chaves do namespace `validation`. Os valores de status espelham o enum
// NecropsySystemStatus do Prisma; distribuição/severidade vêm de necropsy-enums. O SISTEMA
// é um id do catálogo (NecropsySystem), validado por existência no servidor — não por enum.

export const necropsyStatusSchema = z.enum(NECROPSY_STATUS_VALUES)

/**
 * Pronunciamento sobre um sistema (upsert por `(animalId, system)`).
 *
 * O motivo é obrigatório em NOT_EXAMINED e proibido nos demais estados: um motivo pendurado
 * num sistema "sem alteração" não teria como ser exibido, e sobreviveria escondido a uma
 * troca de estado.
 */
export const upsertSystemExamSchema = z
  .object({
    systemId: z.string().min(1, "required"),
    // null = "não avaliado": acrescenta o sistema ao laudo sem se pronunciar sobre ele.
    status: necropsyStatusSchema.nullish().transform((v) => v ?? null),
    notExaminedReason: optionalText(LIMITS.shortText),
  })
  .superRefine((data, ctx) => {
    const reason = data.notExaminedReason?.trim()
    if (data.status === "NOT_EXAMINED" && !reason) {
      ctx.addIssue({
        code: "custom",
        path: ["notExaminedReason"],
        message: "notExaminedReasonRequired",
      })
    }
    if (data.status !== "NOT_EXAMINED" && reason) {
      ctx.addIssue({
        code: "custom",
        path: ["notExaminedReason"],
        message: "notExaminedReasonNotAllowed",
      })
    }
  })

// Quantidade de parasitas: inteiro não negativo; null = "não informado".
const optionalCount = z
  .number({ error: "number" })
  .int("integer")
  .min(0, "min")
  .nullish()
  .transform((v) => (v === undefined ? undefined : (v ?? null)))

// Tri-estado do SIMBA — null é um valor de verdade ("não informado"), não ausência.
const triState = z
  .boolean()
  .nullish()
  .transform((v) => (v === undefined ? undefined : (v ?? null)))

const grossFindingFields = z.object({
  systemId: z.string().min(1, "required"),
  // Topografia dentro do sistema (o sistema vem do exame). Órgão é referência ao catálogo e
  // é OPCIONAL: o achado pode ser do sistema como um todo, ou o órgão pode ainda não estar
  // cadastrado. Tecido e local são texto livre.
  organId: optionalText(LIMITS.name),
  tissue: optionalText(LIMITS.microText),
  site: optionalText(LIMITS.microText),
  lesion: z.string().min(1, "required").max(LIMITS.name),
  distribution: z.enum(DISTRIBUTION_VALUES).nullish(),
  severity: z.enum(SEVERITY_VALUES).nullish(),
  notes: optionalText(LIMITS.longText),
  parasitesPresent: triState,
  parasitesCollected: triState,
  parasiteCount: optionalCount,
})

/**
 * Quantidade só faz sentido se os parasitas foram COLETADOS.
 *
 * Sem esta regra dá para gravar "coletado: não · quantidade: 3", que é contradição — a
 * interface desabilita o campo, mas o servidor não pode confiar nisso. Quando `collected`
 * não vem no corpo (edição parcial), não há como julgar e a checagem não opina.
 */
function parasiteCountRequiresCollected(
  data: { parasitesCollected?: boolean | null; parasiteCount?: number | null },
  ctx: z.RefinementCtx,
) {
  if (typeof data.parasiteCount !== "number") return
  if (data.parasitesCollected === undefined) return
  if (data.parasitesCollected !== true) {
    ctx.addIssue({
      code: "custom",
      path: ["parasiteCount"],
      message: "parasiteCountRequiresCollected",
    })
  }
}

export const createGrossFindingSchema = grossFindingFields.superRefine(
  parasiteCountRequiresCollected,
)

// A edição não muda o sistema: mover um achado entre sistemas é remover e recriar (a
// posição pertence ao exame de origem).
export const updateGrossFindingSchema = grossFindingFields
  .omit({ systemId: true })
  .partial()
  .superRefine(parasiteCountRequiresCollected)

export const createHistopathologyFindingSchema = z.object({
  organId: z.string().min(1, "required"),
  finding: z.string().min(1, "required").max(LIMITS.longText),
})

export const updateHistopathologyFindingSchema = createHistopathologyFindingSchema.partial()

export type UpsertSystemExamData = z.infer<typeof upsertSystemExamSchema>
export type CreateGrossFindingData = z.infer<typeof createGrossFindingSchema>
export type UpdateGrossFindingData = z.infer<typeof updateGrossFindingSchema>
export type CreateHistopathologyFindingData = z.infer<typeof createHistopathologyFindingSchema>
export type UpdateHistopathologyFindingData = z.infer<typeof updateHistopathologyFindingSchema>
