import { z } from "zod"

import { LIMITS } from "@/schemas/limits"

// Mensagens = chaves do namespace `validation`.

// Teto da lista pessoal. Como o formulário salva o tipo digitado automaticamente, sem um
// limite a lista cresceria com cada variação de digitação e deixaria de ser um atalho.
export const USER_SAMPLE_TYPE_MAX = 50

export const userSampleTypeSchema = z.object({
  value: z.string().trim().min(1, "required").max(LIMITS.name),
})

export type UserSampleTypeData = z.infer<typeof userSampleTypeSchema>

// Chave de comparação de duplicatas: sem caixa, sem acento e sem espaço repetido. "DNA
// extraído" e "dna  extraido" são o MESMO item da lista (o valor exibido é o primeiro
// gravado); a amostra continua recebendo o texto exato digitado no formulário.
export function sampleTypeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
}
