// MARES — Biometria do indivíduo: helpers puros (client-safe).
//
// O vocabulário de medidas NÃO é catalogado: o rótulo do SIMBA é guardado literal e é o mesmo
// texto exibido na tela, sem tradução. Isso mantém o sistema compatível com qualquer espécie
// sem mapeamento prévio — formulário novo entra sem tocar em código. Ver docs/PLANO_BIOMETRIA.md.

import type { AnimalBiometry, BiometryMeasure } from "@/types/biometry"

/** Minúsculas, sem acento e com espaços colapsados — forma de COMPARAÇÃO de rótulos. */
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Rótulo do peso total. É a única medida que não vive no JSON — ver `stripWeight`. */
export function isWeightLabel(label: string): boolean {
  return normalizeLabel(label).startsWith("peso")
}

/**
 * Unidade de exibição de uma medida.
 *
 * O `measurementUnit` do SIMBA é UM campo para o bloco inteiro e veio "Cm" em 137/137 registros
 * — inclusive nos que contêm peso (kg) e contagem de dentes (unid). Serve, portanto, como
 * unidade BASE das medidas de comprimento; as duas exceções saem do rótulo, seguindo a
 * nomenclatura do próprio SIMBA ("Peso…", "Número de…"), que é consistente.
 *
 * Derivada na exibição e nunca gravada por medida: melhorar a regra conserta o histórico
 * inteiro de uma vez, em vez de congelar um palpite em 24 linhas por animal.
 */
export function unitForMeasure(label: string, base: string | null | undefined): string {
  const l = normalizeLabel(label)
  if (l.startsWith("peso")) return "kg"
  if (l.startsWith("numero")) return "unid"
  return (base ?? "cm").toLowerCase()
}

/** Contagem (dentes) é inteiro; as demais medidas aceitam decimal. */
export function isCountMeasure(label: string): boolean {
  return normalizeLabel(label).startsWith("numero")
}

/**
 * Tira o "Peso total" dos valores e devolve o peso à parte.
 *
 * O peso da carcaça já mora em `Animal.necropsyWeightKg` — está no formulário do indivíduo, nos
 * dois exports e na auditoria. Guardá-lo também aqui daria duas casas ao mesmo número, que é
 * exatamente o defeito que o PR #75 corrigiu.
 *
 * O RÓTULO continua na lista (com `value: null`), para preservar a posição dele no formulário
 * e alimentar o autocompletar; a tela desenha ali o valor da coluna.
 */
export function stripWeight(measures: BiometryMeasure[]): {
  measures: BiometryMeasure[]
  weightKg: number | null
  // Se o bloco sequer TEM o rótulo de peso. Sem ele o peso não é assunto desta gravação, e
  // `necropsyWeightKg` (que também é editável pelo formulário do indivíduo) fica intocado —
  // salvar a biometria de um formulário sem peso não pode apagar o que alguém digitou lá.
  hasWeightLabel: boolean
} {
  let weightKg: number | null = null
  let hasWeightLabel = false
  const out = measures.map((m) => {
    if (!isWeightLabel(m.label)) return m
    hasWeightLabel = true
    // Zero é preenchimento de formulário: nenhuma carcaça pesa 0 kg.
    if (m.value != null && m.value > 0) weightKg = m.value
    return { label: m.label, value: null }
  })
  return { measures: out, weightKg, hasWeightLabel }
}

/**
 * Inverso de `stripWeight`: recoloca o peso da coluna no slot do rótulo, para a tela desenhar
 * a lista na ordem do formulário do SIMBA, com o peso no lugar dele.
 */
export function withWeight(
  measures: readonly BiometryMeasure[],
  weightKg: number | null,
): BiometryMeasure[] {
  return measures.map((m) => (isWeightLabel(m.label) ? { label: m.label, value: weightKg } : m))
}

/** Medidas com valor (as vazias existem para marcar "não informado" e ensinar o formulário). */
export function filledCount(b: AnimalBiometry | null): number {
  return b ? b.measures.filter((m) => m.value != null).length : 0
}

/**
 * Rótulos já vistos num grupo, na ordem em que aparecem, sem repetir.
 *
 * É o vocabulário do cadastro manual: sem lista canônica, os campos que a aba oferece saem do
 * que já está no banco. A primeira importação de um grupo ensina o formulário inteiro — por
 * isso as medidas vazias também são guardadas.
 */
export function mergeLabels(blocks: readonly AnimalBiometry[]): string[] {
  const seen = new Map<string, string>()
  for (const b of blocks) {
    for (const m of b.measures) {
      const key = normalizeLabel(m.label)
      if (key && !seen.has(key)) seen.set(key, m.label)
    }
  }
  return [...seen.values()]
}
