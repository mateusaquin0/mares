import { z } from "zod"

// Helpers de schema compartilhados. Mensagens = chaves do namespace `validation`.
// Semântica de campos opcionais: ausente (undefined) -> não altera; null ou "" -> limpa
// (null); senão trim. Aceitar null explicitamente evita 422 quando o cliente envia null.

export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null))

export const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null))
  .refine((v) => v == null || !Number.isNaN(Date.parse(v)), "invalidDate")

// Número opcional que aceita null para limpar.
export const optionalNumber = z.number({ error: "number" }).nullable().optional()
