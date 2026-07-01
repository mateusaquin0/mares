import { z } from "zod"

// As mensagens são CHAVES do namespace `validation` (i18n), resolvidas no componente.

// Edição dos dados da organização (nome + localização) por um admin da org.
export const updateOrganizationSchema = z.object({
  name: z.string().min(3, "min3").max(255),
  city: z.string().max(255).optional().or(z.literal("")),
  state: z.string().max(255).optional().or(z.literal("")),
  country: z.string().max(255).optional().or(z.literal("")),
})

// Formulário público de solicitação de acesso (novo admin de organização).
export const accessRequestSchema = z.object({
  email: z.string().email("email"),
  requesterName: z.string().min(2, "name").max(255),
  organizationName: z.string().min(3, "min3").max(255),
  acceptTerms: z.boolean().refine((v) => v === true, { message: "termsRequired" }),
})

// admin adiciona um pesquisador por e-mail. `name` é exigido pelo servidor apenas
// quando o e-mail ainda não pertence a nenhum usuário.
export const addMemberSchema = z.object({
  email: z.string().email("email"),
  name: z.string().min(2, "nameMin2").max(255).optional(),
  role: z.enum(["ORG_ADMIN", "RESEARCHER"]).optional(),
})

export const updateMemberRoleSchema = z.object({
  role: z.enum(["ORG_ADMIN", "RESEARCHER"]),
})

export const setActiveOrgSchema = z.object({
  orgId: z.string().min(1),
})

export type AccessRequestData = z.infer<typeof accessRequestSchema>
export type AddMemberData = z.infer<typeof addMemberSchema>
