import { describe, it, expect } from "vitest"

import {
  filledCount,
  isCountMeasure,
  isWeightLabel,
  mergeLabels,
  normalizeLabel,
  stripWeight,
  unitForMeasure,
  withWeight,
} from "@/lib/biometry"
import { toBiometry } from "@/lib/biometry-db"

describe("normalizeLabel", () => {
  it("iguala grafias que só diferem em acento, caixa e espaçamento", () => {
    expect(normalizeLabel("Circunferência do corpo")).toBe("circunferencia do corpo")
    expect(normalizeLabel("  PESO   TOTAL ")).toBe("peso total")
  })

  // A variação existe no próprio SIMBA: o formulário de quelônio diz "Comprimento cabeça" e o
  // de ave, "Comprimento da cabeça". Normalizar não junta as duas (têm uma palavra a mais),
  // e é isso mesmo: são formulários diferentes e nunca se comparam.
  it("não junta rótulos que diferem em palavras", () => {
    expect(normalizeLabel("Comprimento cabeça")).not.toBe(normalizeLabel("Comprimento da cabeça"))
  })
})

describe("unitForMeasure", () => {
  // O measurementUnit do SIMBA é UM campo para o bloco inteiro e vem "Cm" mesmo nos registros
  // que contêm peso e contagem de dentes — usá-lo puro gravaria "32 cm de dentes".
  it("usa a unidade base do registro nas medidas de comprimento", () => {
    expect(unitForMeasure("Circunferência do corpo na altura das axilas", "Cm")).toBe("cm")
    expect(unitForMeasure("Largura nadadeira caudal", null)).toBe("cm")
  })

  it("deriva kg do rótulo de peso e unid do de contagem", () => {
    expect(unitForMeasure("Peso total", "Cm")).toBe("kg")
    expect(unitForMeasure("Número de dentes maxila direita", "Cm")).toBe("unid")
  })
})

describe("isWeightLabel / isCountMeasure", () => {
  it("reconhece peso e contagem pela nomenclatura do SIMBA", () => {
    expect(isWeightLabel("Peso total")).toBe(true)
    expect(isWeightLabel("Comprimento total")).toBe(false)
    expect(isCountMeasure("Número de dentes mandíbula esquerda")).toBe(true)
    expect(isCountMeasure("Altura da nadadeira dorsal")).toBe(false)
  })
})

describe("stripWeight / withWeight", () => {
  const medidas = [
    { label: "Comprimento total", value: 130 },
    { label: "Peso total", value: 31 },
    { label: "Largura nadadeira caudal", value: null },
  ]

  it("tira o peso da lista, mas mantém o rótulo para preservar a posição", () => {
    const { measures, weightKg } = stripWeight(medidas)
    expect(weightKg).toBe(31)
    expect(measures).toEqual([
      { label: "Comprimento total", value: 130 },
      { label: "Peso total", value: null },
      { label: "Largura nadadeira caudal", value: null },
    ])
  })

  // Zero é preenchimento de formulário no SIMBA: nenhuma carcaça pesa 0 kg.
  it("ignora peso zerado", () => {
    expect(stripWeight([{ label: "Peso total", value: 0 }]).weightKg).toBeNull()
  })

  // O peso também é editável no formulário do indivíduo. Salvar a biometria de um formulário
  // que não tem "Peso total" (quelônio antigo, cadastro manual) não pode apagar o que foi
  // digitado lá — por isso o chamador precisa saber se o rótulo sequer existe.
  it("sinaliza quando o bloco não tem o rótulo de peso", () => {
    expect(stripWeight([{ label: "Comprimento total", value: 130 }]).hasWeightLabel).toBe(false)
    expect(stripWeight(medidas).hasWeightLabel).toBe(true)
    // Rótulo presente e vazio é decisão explícita ("não pesado"), e limpa o peso.
    const vazio = stripWeight([{ label: "Peso total", value: null }])
    expect(vazio.hasWeightLabel).toBe(true)
    expect(vazio.weightKg).toBeNull()
  })

  it("withWeight recoloca o peso no slot do rótulo", () => {
    const { measures } = stripWeight(medidas)
    expect(withWeight(measures, 31)).toEqual(medidas)
  })
})

describe("mergeLabels", () => {
  // É o vocabulário do cadastro manual: sem catálogo, os campos que a aba oferece vêm do que
  // já está no banco. Por isso as medidas VAZIAS também entram.
  it("junta os rótulos na ordem em que aparecem, sem repetir", () => {
    const labels = mergeLabels([
      { group: "Odontoceti", unit: "Cm", measures: [{ label: "Comprimento total", value: 130 }] },
      {
        group: "Odontoceti",
        unit: "Cm",
        measures: [
          { label: "comprimento  total", value: 94 }, // mesma medida, outra grafia
          { label: "Peso total", value: null }, // vazia, mas ensina o campo
        ],
      },
    ])
    expect(labels).toEqual(["Comprimento total", "Peso total"])
  })
})

describe("filledCount", () => {
  it("conta só as medidas com valor", () => {
    expect(
      filledCount({
        group: null,
        unit: null,
        measures: [
          { label: "a", value: 1 },
          { label: "b", value: null },
          { label: "c", value: 0 },
        ],
      }),
    ).toBe(2)
    expect(filledCount(null)).toBe(0)
  })
})

describe("toBiometry", () => {
  it("lê o bloco gravado", () => {
    expect(
      toBiometry({
        group: "Odontoceti",
        unit: "Cm",
        measures: [{ label: "Peso total", value: 31 }],
      }),
    ).toEqual({ group: "Odontoceti", unit: "Cm", measures: [{ label: "Peso total", value: 31 }] })
  })

  // A coluna é JSONB livre (restore, versão anterior do formato): ler defensivamente evita
  // quebrar a tela do indivíduo por causa de uma linha malformada.
  it("descarta o que não tiver forma, sem quebrar", () => {
    expect(toBiometry(null)).toBeNull()
    expect(toBiometry("texto")).toBeNull()
    expect(toBiometry({ group: "X" })).toBeNull() // sem measures
    expect(
      toBiometry({
        group: 42,
        measures: [
          { label: "ok", value: 1 },
          { label: "", value: 2 }, // rótulo vazio
          { label: "sem valor", value: "x" }, // valor não numérico
          "lixo",
        ],
      }),
    ).toEqual({
      group: null,
      unit: null,
      measures: [
        { label: "ok", value: 1 },
        { label: "sem valor", value: null },
      ],
    })
  })
})
