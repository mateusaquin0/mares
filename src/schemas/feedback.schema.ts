import { z } from "zod"

// Sugestões e relatos de bug. Mensagens = chaves do namespace `validation` (i18n).
export const feedbackTypeSchema = z.enum(["SUGGESTION", "BUG"])
export const feedbackStatusSchema = z.enum(["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX", "REOPENED"])

// Status que a TRIAGEM pode gravar. `REOPENED` fica de fora de propósito: ele significa
// "o autor pediu para revisitar", e só o autor o produz (rota de reabertura). O admin sai
// dele triando — para IN_REVIEW, RESOLVED ou WONT_FIX.
export const adminFeedbackStatusSchema = z.enum(["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX"])

// Limites de caracteres (também refletidos na UI: maxLength + contador).
export const FEEDBACK_TITLE_MAX = 100
export const FEEDBACK_MESSAGE_MAX = 500
// Resposta ao autor. O mínimo evita justificativa vazia de conteúdo ("não", "ok") no
// descarte; a UI desabilita o botão de confirmar abaixo dele.
export const FEEDBACK_RESOLUTION_MIN = 10
export const FEEDBACK_RESOLUTION_MAX = 1000

// Envio pelo usuário autenticado.
export const createFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  title: z.string().trim().min(1, "required").max(FEEDBACK_TITLE_MAX),
  message: z.string().trim().min(1, "required").max(FEEDBACK_MESSAGE_MAX),
  // De onde o usuário enviou (contexto). Opcional.
  pageUrl: z.string().max(500).optional().or(z.literal("")),
})

// Correção pelo próprio autor, enquanto o feedback ainda não foi triado (status NEW).
// Deriva do schema de envio: os limites de título/mensagem nunca divergem entre criar e
// editar. `pageUrl` fica de fora — é o contexto de ONDE o relato nasceu, não conteúdo.
export const updateMyFeedbackSchema = createFeedbackSchema.pick({
  type: true,
  title: true,
  message: true,
})

// Triagem pelo admin global: mudar status, anotar internamente (`adminNote`) e/ou escrever
// a resposta ao autor (`resolutionNote`) — os três são independentes entre si.
//
// A regra "descartar exige justificativa" depende do ESTADO SALVO (o payload pode mudar só
// o status, mantendo uma nota já escrita), então só o `superRefine` do caso óbvio mora aqui;
// a invariante completa é aplicada em `assertResolutionNote` (src/lib/feedback.ts).
export const updateFeedbackSchema = z
  .object({
    status: adminFeedbackStatusSchema.optional(),
    adminNote: z.string().max(2000).nullish(),
    resolutionNote: z.string().max(FEEDBACK_RESOLUTION_MAX).nullish(),
  })
  .refine(
    (d) => d.status !== undefined || d.adminNote !== undefined || d.resolutionNote !== undefined,
    { message: "required" },
  )
  // Descarte com justificativa vazia/curta no mesmo payload: recusa já na validação.
  .refine(
    (d) =>
      d.status !== "WONT_FIX" ||
      d.resolutionNote === undefined ||
      (d.resolutionNote?.trim().length ?? 0) >= FEEDBACK_RESOLUTION_MIN,
    { message: "required", path: ["resolutionNote"] },
  )

// ── Conversa do ticket ──────────────────────────────────────────────────────
// Mensagem trocada entre quem reportou e a administração. Bem mais longa que o relato
// (500): é onde se descrevem passos de reprodução, versões de navegador etc.
export const FEEDBACK_MESSAGE_BODY_MAX = 2000

// O texto é sempre obrigatório: imagem é complemento de uma mensagem, não substituta —
// um balão vazio com um print solto não diz o que se quer mostrar nele.
export const createFeedbackMessageSchema = z.object({
  body: z.string().trim().min(1, "required").max(FEEDBACK_MESSAGE_BODY_MAX),
})

// ── Reabertura pelo autor ───────────────────────────────────────────────────
// O mínimo espelha o da justificativa de descarte: o admin encerrou explicando por quê, e
// quem discorda também explica — "não concordo" não dá o que triar.
export const FEEDBACK_REOPEN_MIN = FEEDBACK_RESOLUTION_MIN

export const reopenFeedbackSchema = z.object({
  reason: z.string().trim().min(FEEDBACK_REOPEN_MIN, "required").max(FEEDBACK_MESSAGE_BODY_MAX),
})

export type CreateFeedbackData = z.infer<typeof createFeedbackSchema>
export type ReopenFeedbackData = z.infer<typeof reopenFeedbackSchema>
export type CreateFeedbackMessageData = z.infer<typeof createFeedbackMessageSchema>
export type UpdateMyFeedbackData = z.infer<typeof updateMyFeedbackSchema>
export type UpdateFeedbackData = z.infer<typeof updateFeedbackSchema>
export type FeedbackTypeValue = z.infer<typeof feedbackTypeSchema>
export type FeedbackStatusValue = z.infer<typeof feedbackStatusSchema>
