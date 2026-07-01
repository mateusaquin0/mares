import { z } from "zod"

// As mensagens são CHAVES do namespace `validation` (i18n), resolvidas no componente.
// Ver docs/I18N.md (§ validação).
export const loginSchema = z.object({
  email: z.string().email("email"),
  password: z.string().min(6, "passwordMin6"),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email("email"),
})

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, "passwordMin8"),
    confirm: z.string(),
    acceptTerms: z.boolean().refine((v) => v === true, { message: "termsRequired" }),
  })
  .refine((d) => d.password === d.confirm, {
    message: "passwordsNoMatch",
    path: ["confirm"],
  })

export type LoginData = z.infer<typeof loginSchema>
export type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>
export type SetPasswordData = z.infer<typeof setPasswordSchema>
