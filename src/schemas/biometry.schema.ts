import { z } from "zod"

import { LIMITS } from "@/schemas/limits"

// Mensagens = chaves do namespace `validation`. Não há enum nem id de catálogo aqui: o rótulo
// é texto livre, porque o vocabulário vem do formulário do SIMBA e precisa aceitar espécie
// nova sem mapeamento prévio. Ver docs/PLANO_BIOMETRIA.md.

// Teto de medidas por indivíduo. O maior formulário observado tem 24 campos; o limite é
// folgado o bastante para formulários futuros e ainda barra payload abusivo.
export const MAX_MEASURES = 100

const measureSchema = z.object({
  label: z.string().min(1, "required").max(LIMITS.name),
  // null = o formulário tem o campo e ninguém mediu ("Não informado" na tela do SIMBA).
  // Negativo não existe em biometria; zero é aceito porque "0 dente" é achado legítimo —
  // o zero de comprimento/peso é filtrado na importação, não aqui.
  value: z
    .number({ error: "number" })
    .min(0, "min")
    .finite("number")
    .nullish()
    .transform((v) => v ?? null),
})

export const saveBiometrySchema = z.object({
  // Formulário do SIMBA, literal ("Odontoceti"). Null quando o grupo ainda não foi nomeado.
  group: z.string().max(LIMITS.tinyText).nullish().default(null),
  // Unidade base das medidas de comprimento (`measurementUnit`). Null → "cm" na exibição.
  unit: z.string().max(LIMITS.measureUnit).nullish().default(null),
  measures: z
    .array(measureSchema)
    .max(MAX_MEASURES)
    // Dois valores sob o mesmo rótulo tornariam a leitura ambígua e quebrariam a comparação
    // entre indivíduos, que é feita pelo rótulo.
    .refine(
      (ms) => new Set(ms.map((m) => m.label.trim().toLowerCase())).size === ms.length,
      "duplicateLabel",
    ),
})

export type SaveBiometryData = z.infer<typeof saveBiometrySchema>
