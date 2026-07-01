import { z } from "zod"

// Helpers de schema compartilhados. Mensagens = chaves do namespace `validation`.
// Semântica de campos opcionais: ausente -> undefined (não altera); "" -> null (limpa); senão trim.

export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.trim() ? v.trim() : null))

export const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim() ? v.trim() : null))
  .refine((v) => v == null || !Number.isNaN(Date.parse(v)), "invalidDate")

// Número opcional que aceita null para limpar.
export const optionalNumber = z.number({ error: "number" }).nullable().optional()
