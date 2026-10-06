import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { buildDescriptiveDiagnosis } from "@/lib/necropsy-report"
import {
  ANTHROPIC_INTERACTION_OPTIONS,
  DISTRIBUTION_OPTIONS,
  NECROPSY_STATUS_OPTIONS,
  SEVERITY_OPTIONS,
} from "@/lib/necropsy-enums"
import {
  createGrossFindingSchema,
  updateGrossFindingSchema,
  createHistopathologyFindingSchema,
  setNecropsyScreeningSchema,
  upsertSystemExamSchema,
} from "@/schemas/necropsy.schema"

const organ = (pt: string, en: string) => ({ organ: { name: { pt, en } } })

describe("buildDescriptiveDiagnosis", () => {
  it("junta órgão e achado numa sentença por linha, na ordem recebida", () => {
    const text = buildDescriptiveDiagnosis("pt", [
      { ...organ("Pulmão", "Lung"), finding: "edema acentuado" },
      { ...organ("Baço", "Spleen"), finding: "esplenite granulocítica, multifocal e moderada" },
    ])
    expect(text).toBe(
      "Pulmão, edema acentuado. Baço, esplenite granulocítica, multifocal e moderada.",
    )
  })

  it("normaliza o ponto final digitado pelo usuário (não duplica)", () => {
    const text = buildDescriptiveDiagnosis("pt", [
      { ...organ("Rim", "Kidney"), finding: "congestão moderada." },
    ])
    expect(text).toBe("Rim, congestão moderada.")
  })

  it("usa o nome do órgão no idioma ativo", () => {
    const findings = [{ ...organ("Fígado", "Liver"), finding: "hepatite periportal" }]
    expect(buildDescriptiveDiagnosis("en", findings)).toBe("Liver, hepatite periportal.")
  })

  it("devolve string vazia sem achados, e ignora linhas sem texto", () => {
    expect(buildDescriptiveDiagnosis("pt", [])).toBe("")
    expect(
      buildDescriptiveDiagnosis("pt", [
        { ...organ("Rim", "Kidney"), finding: "   " },
        { ...organ("Baço", "Spleen"), finding: "esplenite" },
      ]),
    ).toBe("Baço, esplenite.")
  })
})

describe("upsertSystemExamSchema", () => {
  const base = { systemId: "sys-1" }

  it("exige o motivo em NOT_EXAMINED", () => {
    const r = upsertSystemExamSchema.safeParse({ ...base, status: "NOT_EXAMINED" })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe("notExaminedReasonRequired")
  })

  it("aceita NOT_EXAMINED com motivo", () => {
    const r = upsertSystemExamSchema.safeParse({
      ...base,
      status: "NOT_EXAMINED",
      notExaminedReason: "Autólise",
    })
    expect(r.success).toBe(true)
    expect(r.data?.notExaminedReason).toBe("Autólise")
  })

  it("recusa motivo pendurado num estado que não o exibe", () => {
    const r = upsertSystemExamSchema.safeParse({
      ...base,
      status: "NO_CHANGE",
      notExaminedReason: "Autólise",
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe("notExaminedReasonNotAllowed")
  })

  it("exige o id do sistema", () => {
    expect(upsertSystemExamSchema.safeParse({ systemId: "", status: "NO_CHANGE" }).success).toBe(
      false,
    )
  })

  // Acrescentar o sistema ao laudo sem se pronunciar: é o estado "não avaliado", que só
  // existe porque o laudo declara os sistemas que a necrópsia previa cobrir.
  it("aceita status nulo (sistema entra no laudo como não avaliado)", () => {
    const r = upsertSystemExamSchema.safeParse({ ...base, status: null })
    expect(r.success).toBe(true)
    expect(r.data?.status).toBeNull()
  })
})

describe("createGrossFindingSchema", () => {
  const valid = { systemId: "sys-1", lesion: "Marca linear" }

  it("aceita o mínimo: sistema e lesão", () => {
    expect(createGrossFindingSchema.safeParse(valid).success).toBe(true)
  })

  it("exige a lesão — é ela que diz o que foi encontrado", () => {
    expect(createGrossFindingSchema.safeParse({ ...valid, lesion: "" }).success).toBe(false)
  })

  // A topografia é toda opcional: o achado pode ser do sistema como um todo, e o órgão pode
  // ainda não estar no catálogo. O sistema em si vem do exame pai, não deste corpo.
  it("aceita topografia parcial ou ausente", () => {
    expect(createGrossFindingSchema.safeParse({ ...valid, organId: "o1" }).success).toBe(true)
    expect(
      createGrossFindingSchema.safeParse({ ...valid, tissue: "derme", site: "região ventral" })
        .success,
    ).toBe(true)
    expect(createGrossFindingSchema.safeParse(valid).data?.organId).toBeUndefined()
  })

  it("preserva o tri-estado: null é 'não informado', não ausência", () => {
    const r = createGrossFindingSchema.safeParse({ ...valid, parasitesPresent: null })
    expect(r.success).toBe(true)
    expect(r.data?.parasitesPresent).toBeNull()
    // Ausente continua ausente (undefined): o PATCH não mexe no campo.
    expect(createGrossFindingSchema.safeParse(valid).data?.parasitesPresent).toBeUndefined()
  })

  it("recusa quantidade negativa ou fracionária", () => {
    expect(createGrossFindingSchema.safeParse({ ...valid, parasiteCount: -1 }).success).toBe(false)
    expect(createGrossFindingSchema.safeParse({ ...valid, parasiteCount: 2.5 }).success).toBe(false)
    expect(createGrossFindingSchema.safeParse({ ...valid, parasiteCount: 0 }).success).toBe(true)
  })

  // Contar o que não foi coletado é contradição. A interface desabilita o campo, mas a
  // regra tem de existir no servidor — interface não é validação.
  it("só aceita quantidade quando os parasitas foram coletados", () => {
    const comQtd = { ...valid, parasiteCount: 3 }
    expect(
      createGrossFindingSchema.safeParse({ ...comQtd, parasitesCollected: true }).success,
    ).toBe(true)
    expect(
      createGrossFindingSchema.safeParse({ ...comQtd, parasitesCollected: false }).success,
    ).toBe(false)
    expect(
      createGrossFindingSchema.safeParse({ ...comQtd, parasitesCollected: null }).success,
    ).toBe(false)
  })

  it("na edição parcial sem `coletado`, não opina sobre a quantidade", () => {
    // O corpo não diz o estado de coleta; recusar aqui barraria uma edição legítima.
    expect(updateGrossFindingSchema.safeParse({ parasiteCount: 3 }).success).toBe(true)
  })

  it("recusa distribuição/severidade fora do vocabulário", () => {
    expect(createGrossFindingSchema.safeParse({ ...valid, distribution: "quase" }).success).toBe(
      false,
    )
    expect(createGrossFindingSchema.safeParse({ ...valid, severity: "gravíssimo" }).success).toBe(
      false,
    )
  })
})

describe("createHistopathologyFindingSchema", () => {
  it("exige órgão e achado", () => {
    expect(createHistopathologyFindingSchema.safeParse({ organId: "", finding: "x" }).success).toBe(
      false,
    )
    expect(
      createHistopathologyFindingSchema.safeParse({ organId: "o1", finding: "" }).success,
    ).toBe(false)
    expect(
      createHistopathologyFindingSchema.safeParse({ organId: "o1", finding: "congestão" }).success,
    ).toBe(true)
  })
})

describe("setNecropsyScreeningSchema", () => {
  const vazio = {
    anthropicInteraction: null,
    giContentCollected: null,
    giSolidWaste: null,
    giDetailedScreening: null,
    interactions: [],
  }

  it("trata campo ausente como “não informado” (null), e não como erro", () => {
    const r = setNecropsyScreeningSchema.safeParse({})
    expect(r.success).toBe(true)
    expect(r.data).toEqual(vazio)
  })

  it("aceita as interações quando há indícios, com grau de 1 a 3", () => {
    const base = { ...vazio, anthropicInteraction: true }
    expect(
      setNecropsyScreeningSchema.safeParse({
        ...base,
        interactions: [
          { type: "FISHERY", degree: 1 },
          { type: "VESSEL", degree: 3 },
        ],
      }).success,
    ).toBe(true)
    expect(
      setNecropsyScreeningSchema.safeParse({
        ...base,
        interactions: [{ type: "FISHERY", degree: 4 }],
      }).success,
    ).toBe(false)
    expect(
      setNecropsyScreeningSchema.safeParse({
        ...base,
        interactions: [{ type: "FISHERY", degree: 0 }],
      }).success,
    ).toBe(false)
  })

  it("recusa o mesmo tipo duas vezes — seriam dois graus para a mesma interação", () => {
    const r = setNecropsyScreeningSchema.safeParse({
      ...vazio,
      anthropicInteraction: true,
      interactions: [
        { type: "WASTE", degree: 1 },
        { type: "WASTE", degree: 2 },
      ],
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe("duplicateInteraction")
  })

  it("recusa interações sem indício de interação antrópica (“não” ou sem resposta)", () => {
    for (const anthropicInteraction of [false, null]) {
      const r = setNecropsyScreeningSchema.safeParse({
        ...vazio,
        anthropicInteraction,
        interactions: [{ type: "FISHERY", degree: 2 }],
      })
      expect(r.success).toBe(false)
      expect(r.error?.issues[0]?.message).toBe("interactionsRequireAnthropic")
    }
  })
})

// Os vocabulários são listas em código, então uma chave nova só quebra em runtime — e só
// na tela que o dev não abriu. Este teste exige as duas traduções de cada termo.
describe("i18n dos vocabulários de necrópsia", () => {
  const ALL_KEYS = [
    ...DISTRIBUTION_OPTIONS,
    ...SEVERITY_OPTIONS,
    ...NECROPSY_STATUS_OPTIONS,
    ...ANTHROPIC_INTERACTION_OPTIONS,
  ].map((o) => o.key)

  for (const locale of ["pt", "en"] as const) {
    it(`${locale}.necropsy tem todos os rótulos dos vocabulários`, () => {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf-8"),
      ) as Record<string, Record<string, string>>
      const ns = messages.necropsy ?? {}
      expect(ALL_KEYS.filter((k) => !(k in ns))).toEqual([])
      // "não avaliado" é o quarto estado da tela e não existe no enum do banco.
      expect(ns.statusUnset).toBeTruthy()
    })
  }
})
