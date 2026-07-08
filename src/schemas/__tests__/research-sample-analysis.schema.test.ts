import { describe, it, expect } from "vitest"
import { createResearchSchema, protocolEntriesSchema } from "@/schemas/research.schema"
import { createSampleSchema } from "@/schemas/sample.schema"
import { upsertAnalysisSchema } from "@/schemas/analysis.schema"

describe("createResearchSchema", () => {
  it("aceita nome (3+) com protocolos opcionais", () => {
    expect(
      createResearchSchema.safeParse({
        name: "Toxoplasmose em cetáceos",
        protocols: [{ organId: "o1", pathogenId: "p1", examTypeId: "e1" }],
      }).success
    ).toBe(true)
  })

  it("rejeita nome com menos de 3 caracteres", () => {
    expect(createResearchSchema.safeParse({ name: "ab" }).success).toBe(false)
  })

  it("rejeita entrada de protocolo incompleta", () => {
    expect(
      createResearchSchema.safeParse({
        name: "Pesquisa X",
        protocols: [{ organId: "o1", pathogenId: "", examTypeId: "e1" }],
      }).success
    ).toBe(false)
  })
})

describe("protocolEntriesSchema", () => {
  it("exige ao menos uma entrada", () => {
    expect(protocolEntriesSchema.safeParse({ entries: [] }).success).toBe(false)
    expect(
      protocolEntriesSchema.safeParse({ entries: [{ organId: "o", pathogenId: "p", examTypeId: "e" }] }).success
    ).toBe(true)
  })
})

describe("createSampleSchema", () => {
  const valid = {
    researchId: "r1",
    organId: "o1",
    identification: "AM-001",
    sampleType: "Tecido",
  }

  it("aceita amostra com os obrigatórios", () => {
    expect(createSampleSchema.safeParse(valid).success).toBe(true)
  })

  it("exige identificação e tipo", () => {
    expect(createSampleSchema.safeParse({ ...valid, identification: "" }).success).toBe(false)
    expect(createSampleSchema.safeParse({ ...valid, sampleType: "" }).success).toBe(false)
  })

  it("rejeita status fora do domínio", () => {
    expect(createSampleSchema.safeParse({ ...valid, status: "PERDIDA" }).success).toBe(false)
    expect(createSampleSchema.safeParse({ ...valid, status: "STORED" }).success).toBe(true)
  })
})

describe("upsertAnalysisSchema", () => {
  const cell = { sampleId: "s1", pathogenId: "p1", examTypeId: "e1" }

  it("aceita célula sem resultado (não testado)", () => {
    expect(upsertAnalysisSchema.safeParse(cell).success).toBe(true)
  })

  it("aceita resultado do enum e rejeita valor inválido", () => {
    expect(upsertAnalysisSchema.safeParse({ ...cell, result: "POSITIVO" }).success).toBe(true)
    expect(upsertAnalysisSchema.safeParse({ ...cell, result: "TALVEZ" }).success).toBe(false)
  })

  it("aceita result null (limpa a célula)", () => {
    expect(upsertAnalysisSchema.safeParse({ ...cell, result: null }).success).toBe(true)
  })

  it("exige as chaves da célula", () => {
    expect(upsertAnalysisSchema.safeParse({ ...cell, sampleId: "" }).success).toBe(false)
  })
})
