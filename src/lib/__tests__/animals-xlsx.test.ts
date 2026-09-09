import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"

import { buildAnimalsXlsx, type XlsxAnimal } from "@/lib/animals-xlsx"

// A planilha é o formato que sai da aplicação para o mundo — e é gerada por um caminho que
// o TypeScript não valida (chaves de coluna são strings). Estes testes leem o arquivo de
// volta e conferem o que de fato foi escrito.

const orgao = (pt: string) => ({ name: { pt, en: pt } })

function animal(over: Partial<XlsxAnimal> = {}): XlsxAnimal {
  return {
    controlId: "45/26",
    simbaRecordNumber: null,
    species: "Sotalia guianensis",
    taxonFamily: null,
    taxonOrder: null,
    sex: "F",
    lifeStage: "ADULT",
    bodyCondition: null,
    decompositionStage: null,
    deathCondition: null,
    eventDate: null,
    necropsyDate: null,
    necropsyWeightKg: null,
    biometry: null,
    municipality: null,
    state: null,
    executingInstitution: null,
    strandingBeach: null,
    strandingLat: null,
    strandingLon: null,
    isPublic: true,
    macroscopicNotes: null,
    anthropicInteraction: null,
    giContentCollected: null,
    giSolidWaste: null,
    giDetailedScreening: null,
    anthropicInteractions: [],
    research: { name: "Projeto X" },
    _count: { samples: 0 },
    samples: [],
    necropsySystems: [],
    histopathology: [],
    ...over,
  }
}

async function abrir(animais: XlsxAnimal[], locale = "pt") {
  const buf = await buildAnimalsXlsx(animais, locale)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}

// A `key` das colunas é conveniência de runtime do ExcelJS e não é gravada no arquivo: ao
// reler, some. Indexar pelo CABEÇALHO é o que sobra — e de quebra valida os cabeçalhos.
const linhas = (ws: ExcelJS.Worksheet) => {
  const cabecalhos: string[] = []
  ws.getRow(1).eachCell((cell, col) => {
    cabecalhos[col] = String(cell.value ?? "")
  })
  const out: Record<string, unknown>[] = []
  ws.eachRow((row, i) => {
    if (i === 1) return
    const obj: Record<string, unknown> = {}
    cabecalhos.forEach((h, col) => {
      if (h) obj[h] = row.getCell(col).value ?? ""
    })
    out.push(obj)
  })
  return out
}

describe("buildAnimalsXlsx — triagem da carcaça", () => {
  it("escreve as quatro respostas e as interações com grau numa célula só", async () => {
    const wb = await abrir([
      animal({
        anthropicInteraction: true,
        giContentCollected: true,
        giSolidWaste: false,
        giDetailedScreening: null,
        anthropicInteractions: [
          { type: "FISHERY", degree: 2 },
          { type: "VESSEL", degree: 1 },
        ],
      }),
    ])
    const rows = linhas(wb.getWorksheet("Animais")!)
    expect(rows[0]).toMatchObject({
      "Indícios de interação antrópica": "Sim",
      "Interações antrópicas (grau)": "Pesca (grau 2); Embarcações (grau 1)",
      "Coleta de conteúdo gastrointestinal": "Sim",
      "Presença de resíduos sólidos": "Não",
      // O tri-estado sobrevive à planilha: "não informado" não vira "não".
      "Triagem detalhada do conteúdo gastrointestinal": "Não informado",
    })
  })

  it("deixa a célula de interações vazia quando não há nenhuma", async () => {
    const wb = await abrir([animal({ anthropicInteraction: false })])
    const rows = linhas(wb.getWorksheet("Animais")!)
    expect(rows[0]).toMatchObject({
      "Indícios de interação antrópica": "Não",
      "Interações antrópicas (grau)": "",
    })
  })
})

describe("buildAnimalsXlsx — laudo anatomopatológico", () => {
  // Macro e micro compartilham uma aba, discriminados pela coluna "Exame". As colunas
  // específicas de cada um ficam vazias nas linhas do outro.
  it("cria a aba de laudo entre animais e análises", async () => {
    const wb = await abrir([animal()])
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Animais", "Laudo", "Análises"])
  })

  it("escreve uma linha por achado macroscópico, repetindo sistema e estado", async () => {
    const wb = await abrir([
      animal({
        necropsySystems: [
          {
            status: "ALTERED",
            notExaminedReason: null,
            position: 1,
            system: orgao("Sistema respiratório"),
            findings: [
              {
                position: 1,
                organ: orgao("Pulmão"),
                tissue: "derme",
                site: "região ventral",
                lesion: "Marca linear",
                distribution: "focal",
                severity: "mild",
                notes: "sugestiva de interação com pesca",
                parasitesPresent: false,
                parasitesCollected: null,
                parasiteCount: null,
              },
              {
                position: 2,
                organ: null,
                tissue: null,
                site: null,
                lesion: "Congestão",
                distribution: null,
                severity: null,
                notes: null,
                parasitesPresent: true,
                parasitesCollected: true,
                parasiteCount: 3,
              },
            ],
          },
        ],
      }),
    ])
    const rows = linhas(wb.getWorksheet("Laudo")!)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      Animal: "45/26",
      Exame: "Macroscópico",
      Sistema: "Sistema respiratório",
      "Estado do sistema": "Com alteração",
      Nº: 1,
      Órgão: "Pulmão",
      "Lesão / alteração": "Marca linear",
      Distribuição: "Focal",
      Severidade: "Discreto",
    })
    // O sistema e o estado se repetem: planilha é tabela plana e precisa ser filtrável.
    expect(rows[1]).toMatchObject({
      Sistema: "Sistema respiratório",
      "Estado do sistema": "Com alteração",
    })
  })

  it("preserva o tri-estado dos parasitas — 'não' não vira 'não informado'", async () => {
    const wb = await abrir([
      animal({
        necropsySystems: [
          {
            status: "ALTERED",
            notExaminedReason: null,
            position: 1,
            system: orgao("Tegumentar"),
            findings: [
              {
                position: 1,
                organ: null,
                tissue: null,
                site: null,
                lesion: "x",
                distribution: null,
                severity: null,
                notes: null,
                parasitesPresent: false,
                parasitesCollected: null,
                parasiteCount: null,
              },
            ],
          },
        ],
      }),
    ])
    const row = linhas(wb.getWorksheet("Laudo")!)[0]!
    expect(row["Presença de parasitas"]).toBe("Não")
    expect(row["Parasitas coletados"]).toBe("Não informado")
    expect(row["Quantidade"]).toBe("Não informado")
  })

  // "Sem alteração" e "não examinado: autólise" são informação de laudo; sumir da planilha
  // faria o sistema parecer não avaliado.
  it("exporta sistema sem achados, com o motivo quando houver", async () => {
    const wb = await abrir([
      animal({
        necropsySystems: [
          {
            status: "NOT_EXAMINED",
            notExaminedReason: "Autólise",
            position: 1,
            system: orgao("Sistema digestório"),
            findings: [],
          },
        ],
      }),
    ])
    const row = linhas(wb.getWorksheet("Laudo")!)[0]!
    // O motivo cai na coluna compartilhada de achado/observações.
    expect(row).toMatchObject({
      "Estado do sistema": "Não examinado",
      "Achado / observações": "Autólise",
    })
  })

  it("escreve os achados micro e deriva o diagnóstico descritivo na aba de animais", async () => {
    const wb = await abrir([
      animal({
        histopathology: [
          { position: 1, organ: orgao("Pulmão"), finding: "edema acentuado" },
          { position: 2, organ: orgao("Baço"), finding: "esplenite moderada." },
        ],
      }),
    ])
    const micro = linhas(wb.getWorksheet("Laudo")!)
    expect(micro).toHaveLength(2)
    expect(micro[0]).toMatchObject({
      Exame: "Histopatológico",
      Órgão: "Pulmão",
      "Achado / observações": "edema acentuado",
      Nº: 1,
    })

    // A coluna derivada usa a MESMA função da tela, e normaliza o ponto final.
    const animalRow = linhas(wb.getWorksheet("Animais")!)[0]!
    expect(animalRow["Diagnóstico descritivo"]).toBe(
      "Pulmão, edema acentuado. Baço, esplenite moderada.",
    )
  })

  it("usa os cabeçalhos e rótulos em inglês quando o locale é en", async () => {
    const wb = await abrir(
      [
        animal({
          necropsySystems: [
            {
              status: "NO_CHANGE",
              notExaminedReason: null,
              position: 1,
              system: orgao("Respiratory"),
              findings: [],
            },
          ],
        }),
      ],
      "en",
    )
    expect(wb.worksheets.map((w) => w.name)).toContain("Pathology report")
    const row = linhas(wb.getWorksheet("Pathology report")!)[0]!
    expect(row["System state"]).toBe("No change")
    expect(row.Exam).toBe("Gross")
  })
})

describe("buildAnimalsXlsx — biometria", () => {
  const bio = (group: string, measures: { label: string; value: number | null }[]) => ({
    group,
    unit: "Cm",
    measures,
  })

  it("gera uma coluna por medida, com a unidade no cabeçalho, e o peso vindo da coluna do animal", async () => {
    const wb = await abrir([
      animal({
        controlId: "45/26",
        necropsyWeightKg: 31,
        biometry: bio("Odontoceti", [
          { label: "Comprimento total", value: 130 },
          // O peso mora em necropsyWeightKg; na lista fica só o rótulo.
          { label: "Peso total", value: null },
          { label: "Número de dentes maxila direita", value: 31 },
          { label: "Largura nadadeira caudal", value: null },
        ]),
      }),
    ])
    const row = linhas(wb.getWorksheet("Biometria")!)[0]!
    expect(row["Indivíduo"]).toBe("45/26")
    expect(row["Formulário"]).toBe("Odontoceti")
    expect(row["Comprimento total (cm)"]).toBe(130)
    // Unidade derivada do rótulo, não do measurementUnit do registro.
    expect(row["Peso total (kg)"]).toBe(31)
    expect(row["Número de dentes maxila direita (unid)"]).toBe(31)
    // Vazio = "não informado"; distinguir de zero importa (zero dente é achado).
    expect(row["Largura nadadeira caudal (cm)"]).toBe("")
  })

  it("junta rótulos de grafias diferentes numa coluna só", async () => {
    const wb = await abrir([
      animal({
        controlId: "1",
        biometry: bio("Odontoceti", [{ label: "Comprimento total", value: 130 }]),
      }),
      animal({
        controlId: "2",
        biometry: bio("Odontoceti", [{ label: "comprimento  TOTAL", value: 94 }]),
      }),
    ])
    const rows = linhas(wb.getWorksheet("Biometria")!)
    expect(rows).toHaveLength(2)
    expect(rows[0]!["Comprimento total (cm)"]).toBe(130)
    expect(rows[1]!["Comprimento total (cm)"]).toBe(94)
  })

  it("não cria a aba quando nenhum indivíduo tem biometria", async () => {
    const wb = await abrir([animal({ biometry: null })])
    expect(wb.getWorksheet("Biometria")).toBeUndefined()
  })
})
