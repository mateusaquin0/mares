import { z } from "zod"

// Sugestões e relatos de bug. Mensagens = chaves do namespace `validation` (i18n).
export const feedbackTypeSchema = z.enum(["SUGGESTION", "BUG"])
export const feedbackStatusSchema = z.enum(["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX"])

// Envio pelo usuário autenticado.
export const createFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  message: z.string().trim().min(1, "required").max(2000),
  // De onde o usuário enviou (contexto). Opcional.
  pageUrl: z.string().max(500).optional().or(z.literal("")),
})

// Triagem pelo admin global (mudar status e/ou anotar).
export const updateFeedbackSchema = z
  .object({
    status: feedbackStatusSchema.optional(),
    adminNote: z.string().max(2000).nullish(),
  })
  .refine((d) => d.status !== undefined || d.adminNote !== undefined, {
    message: "required",
  })

export type CreateFeedbackData = z.infer<typeof createFeedbackSchema>
export type UpdateFeedbackData = z.infer<typeof updateFeedbackSchema>
export type FeedbackTypeValue = z.infer<typeof feedbackTypeSchema>
export type FeedbackStatusValue = z.infer<typeof feedbackStatusSchema>
