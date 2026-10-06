import { z } from "zod"

import { optionalText } from "@/schemas/common"
import { LIMITS } from "@/schemas/limits"
import {
  ANTHROPIC_INTERACTION_VALUES,
  DISTRIBUTION_VALUES,
  NECROPSY_STATUS_VALUES,
  SEVERITY_VALUES,
} from "@/lib/necropsy-enums"

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

// ── Triagem da carcaça ───────────────────────────────────────────────────────

// Diferente do `triState` acima: aqui a ausência do campo é "não informado" (null), e não
// "não mexer" — o corpo substitui o bloco inteiro.
const screeningTriState = z
  .boolean()
  .nullish()
  .transform((v) => v ?? null)

const anthropicInteractionSchema = z.object({
  type: z.enum(ANTHROPIC_INTERACTION_VALUES),
  degree: z.number({ error: "number" }).int("integer").min(1, "min").max(3, "max"),
})

/**
 * Bloco de triagem inteiro (PUT, não PATCH): as quatro perguntas e a lista de interações
 * chegam juntas e substituem o que havia.
 *
 * Substituição total porque a lista é curta e fechada — a tela edita o bloco como uma coisa
 * só, e um PATCH que omitisse `interactions` teria de escolher entre apagá-las e mantê-las,
 * sem que o corpo diga qual das duas se quis. Campo ausente é "não informado" (null), que é
 * o mesmo tri-estado dos campos de parasita.
 */
export const setNecropsyScreeningSchema = z
  .object({
    anthropicInteraction: screeningTriState,
    giContentCollected: screeningTriState,
    giSolidWaste: screeningTriState,
    giDetailedScreening: screeningTriState,
    interactions: z
      .array(anthropicInteractionSchema)
      .max(ANTHROPIC_INTERACTION_VALUES.length)
      .default([]),
  })
  .superRefine((data, ctx) => {
    // Um tipo repetido seria dois graus para a mesma interação — contradição, e o UNIQUE do
    // banco recusaria com erro de constraint em vez de mensagem de validação.
    const types = new Set(data.interactions.map((i) => i.type))
    if (types.size !== data.interactions.length) {
      ctx.addIssue({ code: "custom", path: ["interactions"], message: "duplicateInteraction" })
    }
    // Listar interações depois de responder "não" (ou nada) à pergunta de triagem deixaria o
    // laudo se contradizendo. A tela esconde a lista nesse caso; o servidor não confia nela.
    if (data.anthropicInteraction !== true && data.interactions.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["interactions"],
        message: "interactionsRequireAnthropic",
      })
    }
  })

export const createHistopathologyFindingSchema = z.object({
  organId: z.string().min(1, "required"),
  finding: z.string().min(1, "required").max(LIMITS.longText),
})

export const updateHistopathologyFindingSchema = createHistopathologyFindingSchema.partial()

export type UpsertSystemExamData = z.infer<typeof upsertSystemExamSchema>
export type SetNecropsyScreeningData = z.infer<typeof setNecropsyScreeningSchema>
export type CreateGrossFindingData = z.infer<typeof createGrossFindingSchema>
export type UpdateGrossFindingData = z.infer<typeof updateGrossFindingSchema>
export type CreateHistopathologyFindingData = z.infer<typeof createHistopathologyFindingSchema>
export type UpdateHistopathologyFindingData = z.infer<typeof updateHistopathologyFindingSchema>
