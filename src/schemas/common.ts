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
  // Exige o dia em ISO (AAAA-MM-DD…): Date.parse aceitaria "10/03/2026" como 3 de outubro.
  .refine(
    (v) => v == null || (/^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))),
    "invalidDate",
  )

// Número opcional que aceita null para limpar.
export const optionalNumber = z.number({ error: "number" }).nullable().optional()
