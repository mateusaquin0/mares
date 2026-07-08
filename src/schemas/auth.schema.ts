import { z } from "zod"

import { LIMITS } from "@/schemas/limits"

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

// Troca de senha na área de perfil (usuário já autenticado; sem aceite de termos).
export const changePasswordSchema = z
  .object({
    password: z.string().min(8, "passwordMin8"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "passwordsNoMatch",
    path: ["confirm"],
  })

// Edição dos próprios dados de perfil.
export const updateProfileSchema = z.object({
  name: z.string().min(2, "name").max(LIMITS.name),
})

export type LoginData = z.infer<typeof loginSchema>
export type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>
export type SetPasswordData = z.infer<typeof setPasswordSchema>
export type ChangePasswordData = z.infer<typeof changePasswordSchema>
export type UpdateProfileData = z.infer<typeof updateProfileSchema>
