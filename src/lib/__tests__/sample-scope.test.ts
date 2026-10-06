// Cenário que estes testes protegem: indivíduo COMPARTILHADO entre pesquisas da mesma
// organização. A amostra pertence a UMA das pesquisas do indivíduo (Sample.researchId), que
// não é necessariamente a pesquisa primária do animal (Animal.researchId).
//
// O escopo de permissão das rotas de amostra/análise/confirmação sai daqui. Enquanto ele vinha
// da pesquisa primária, quem cadastrou a amostra pela pesquisa participante levava 403 ao
// lançar o resultado — e a célula era casada com o protocolo da pesquisa errada (bug reportado
// no animal 25/21, amostra de estômago).

import { describe, it, expect, vi, beforeEach } from "vitest"

const sampleFindUnique = vi.fn()
const analysisFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sample: { findUnique: (...a: unknown[]) => sampleFindUnique(...a) },
    analysis: { findUnique: (...a: unknown[]) => analysisFindUnique(...a) },
  },
}))

const { loadSampleOrg } = await import("@/lib/samples")
const { loadPositiveParent, loadConfirmation } = await import("@/lib/confirmations")

const PRIMARIA = "r-primaria" // pesquisa dona do indivíduo
const PARTICIPANTE = "r-participante" // pesquisa que recebeu o indivíduo e coletou a amostra
const ORG = "org-1"

// Linha da amostra como o banco a devolve, com o vínculo do animal junto: se o código voltar a
// ler a pesquisa pelo animal, ele encontra `PRIMARIA` aqui e o teste acusa.
const sampleRow = {
  id: "s-1",
  animalId: "a-1",
  organId: "o-estomago",
  createdById: "u-autor",
  researchId: PARTICIPANTE,
  orgId: ORG,
  animal: { researchId: PRIMARIA, research: { orgId: ORG } },
}

beforeEach(() => {
  sampleFindUnique.mockReset()
  analysisFindUnique.mockReset()
})

describe("loadSampleOrg — escopo pela pesquisa DONA da amostra", () => {
  it("devolve a pesquisa da amostra, não a primária do animal", async () => {
    sampleFindUnique.mockResolvedValue(sampleRow)
    const sample = await loadSampleOrg("s-1")
    expect(sample.researchId).toBe(PARTICIPANTE)
    expect(sample.orgId).toBe(ORG)
  })

  it("amostra inexistente vira 404", async () => {
    sampleFindUnique.mockResolvedValue(null)
    await expect(loadSampleOrg("s-x")).rejects.toMatchObject({ code: "sampleNotFound" })
  })
})

describe("confirmações — escopo pela pesquisa DONA da amostra", () => {
  const analysisRow = {
    id: "an-1",
    sampleId: "s-1",
    parentAnalysisId: null,
    result: "POSITIVO",
    sample: { researchId: PARTICIPANTE, orgId: ORG, animal: sampleRow.animal },
  }

  it("rastreio-pai: pesquisa da amostra", async () => {
    analysisFindUnique.mockResolvedValue(analysisRow)
    const parent = await loadPositiveParent("an-1")
    expect(parent.researchId).toBe(PARTICIPANTE)
    expect(parent.orgId).toBe(ORG)
  })

  it("confirmação (filha): pesquisa da amostra", async () => {
    analysisFindUnique.mockResolvedValue({ ...analysisRow, id: "an-2", parentAnalysisId: "an-1" })
    const child = await loadConfirmation("an-2")
    expect(child.researchId).toBe(PARTICIPANTE)
    expect(child.orgId).toBe(ORG)
  })
})
