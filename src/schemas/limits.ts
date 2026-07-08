// MARES — Limites de caracteres dos formulários (fonte única da verdade).
// Usados nos schemas Zod (validação de servidor) E na UI (`maxLength` + contador),
// para que o limite exibido ao usuário e o validado no backend nunca divirjam.

export const LIMITS = {
  // Nomes e rótulos de tamanho padrão (nome de grupo/pesquisa, espécie, órgão, exame...).
  name: 255,
  // Identificadores e campos curtos (ID de controle, SIMBA, município, UF, táxon).
  shortText: 120,
  // Campos muito curtos (condição corporal, estágio de decomposição, rótulo de medida).
  tinyText: 60,
  // Unidade de medida (ex.: "cópias/mL").
  measureUnit: 30,
  // Observações e descrições longas (notas de amostra/análise, descrição de pesquisa).
  longText: 2000,
  // Notas macroscópicas do animal (texto livre extenso).
  hugeText: 4000,
} as const

// Feedback tem limites próprios (já refletidos na UI com contador) — reexportados aqui
// para manter um único ponto de referência.
export { FEEDBACK_TITLE_MAX, FEEDBACK_MESSAGE_MAX } from "@/schemas/feedback.schema"
