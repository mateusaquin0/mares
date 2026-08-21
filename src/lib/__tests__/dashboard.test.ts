import { describe, it, expect } from "vitest"
import {
  positivityRate,
  dashboardAnimalWhere,
  dashboardSampleWhere,
  dashboardResearchIds,
} from "@/lib/dashboard"

const ORG = "org-1"
const MINHA = "r-minha"
const VIZINHA = "r-vizinha"

describe("positivityRate", () => {
  it("calcula o percentual positivos/denominador", () => {
    expect(positivityRate(1, 8)).toBe(12.5)
    expect(positivityRate(3, 4)).toBe(75)
  })

  it("retorna 0 quando o denominador é 0 (sem divisão por zero)", () => {
    expect(positivityRate(0, 0)).toBe(0)
    expect(positivityRate(5, 0)).toBe(0)
  })

  it("retorna 0 quando não há positivos", () => {
    expect(positivityRate(0, 10)).toBe(0)
  })

  it("chega a 100% quando todos são positivos", () => {
    expect(positivityRate(10, 10)).toBe(100)
  })
})

describe("dashboardResearchIds", () => {
  it("o filtro do dropdown tem prioridade sobre o escopo", () => {
    expect(dashboardResearchIds({ researchId: MINHA, researchIds: [MINHA, VIZINHA] })).toEqual([
      MINHA,
    ])
  })

  it("sem filtro, agrega o escopo inteiro do usuário", () => {
    expect(dashboardResearchIds({ researchIds: [MINHA, VIZINHA] })).toEqual([MINHA, VIZINHA])
  })

  it("admin sem filtro não restringe por pesquisa", () => {
    expect(dashboardResearchIds({})).toBeUndefined()
  })
})

// Cenário que estes testes protegem: o indivíduo compartilhado pertence a TODAS as pesquisas
// que o estudam, mas cada amostra/análise pertence só à pesquisa DONA (Sample.researchId).
// Antes o dashboard usava a pesquisa primária do animal nos dois níveis: quem recebia o
// indivíduo compartilhado não via as próprias amostras, e quem o cedeu contava as do vizinho.
describe("dashboardAnimalWhere — conjunto efetivo do indivíduo", () => {
  it("conta o indivíduo pela primária OU por participação ACEITA", () => {
    expect(dashboardAnimalWhere(ORG, { researchIds: [MINHA] })).toEqual({
      research: { orgId: ORG },
      OR: [
        { researchId: { in: [MINHA] } },
        { participations: { some: { researchId: { in: [MINHA] }, status: "ACCEPTED" } } },
      ],
    })
  })

  it("o filtro por pesquisa também alcança os compartilhados com ela", () => {
    const where = dashboardAnimalWhere(ORG, { researchId: MINHA, researchIds: [MINHA, VIZINHA] })
    expect(where.OR).toEqual([
      { researchId: { in: [MINHA] } },
      { participations: { some: { researchId: { in: [MINHA] }, status: "ACCEPTED" } } },
    ])
  })

  it("admin sem filtro fica só no escopo da organização", () => {
    expect(dashboardAnimalWhere(ORG, {})).toEqual({ research: { orgId: ORG } })
  })

  it("período: `to` é inclusivo até o fim do dia", () => {
    const where = dashboardAnimalWhere(ORG, { from: "2024-01-01", to: "2024-01-31" })
    expect(where.eventDate).toEqual({
      gte: new Date("2024-01-01"),
      lte: new Date("2024-01-31T23:59:59.999Z"),
    })
  })

  it("a população do filtro por patógeno só olha as amostras do escopo", () => {
    const where = dashboardAnimalWhere(ORG, { researchIds: [MINHA], pathogenId: "p-1" })
    expect(where.samples).toEqual({
      some: {
        researchId: { in: [MINHA] },
        analyses: { some: { pathogenId: "p-1" } },
      },
    })
  })
})

describe("dashboardSampleWhere — amostra conta para a pesquisa DONA", () => {
  it("restringe a amostra ao escopo, não à pesquisa primária do animal", () => {
    expect(dashboardSampleWhere({ researchIds: [MINHA] })).toEqual({
      researchId: { in: [MINHA] },
    })
  })

  it("segue o filtro do dropdown quando ele existe", () => {
    expect(dashboardSampleWhere({ researchId: MINHA, researchIds: [MINHA, VIZINHA] })).toEqual({
      researchId: { in: [MINHA] },
    })
  })

  it("admin sem filtro não restringe a amostra", () => {
    expect(dashboardSampleWhere({})).toEqual({})
  })
})
