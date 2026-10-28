// Invariante de segurança: um compartilhamento PENDENTE não dá visibilidade nenhuma. Toda
// cláusula de escopo por pesquisa passa por estes helpers, então basta um deles esquecer o
// `status: "ACCEPTED"` para um convite ainda não respondido vazar o indivíduo na listagem,
// no mapa, no export e no cálculo de conflito de identificador.

import { describe, it, expect } from "vitest"

import {
  ACCEPTED_PARTICIPATION,
  hiddenInResearches,
  inResearches,
  listedInResearches,
  sharedWithResearches,
} from "@/lib/animal-participation"

describe("cláusulas de participação", () => {
  it("só considera participações ACEITAS", () => {
    expect(ACCEPTED_PARTICIPATION).toEqual({ status: "ACCEPTED" })
    expect(sharedWithResearches(["r1"])).toEqual({
      participations: { some: { researchId: { in: ["r1"] }, status: "ACCEPTED" } },
    })
  })

  it("o conjunto efetivo é pesquisa primária ∪ participações aceitas", () => {
    expect(inResearches(["r1", "r2"])).toEqual([
      { researchId: { in: ["r1", "r2"] } },
      { participations: { some: { researchId: { in: ["r1", "r2"] }, status: "ACCEPTED" } } },
    ])
  })

  it("a listagem desconta as pesquisas que ocultaram o indivíduo", () => {
    expect(listedInResearches(["r1"])).toEqual([
      { researchId: { in: ["r1"] }, primaryHiddenAt: null },
      {
        participations: {
          some: { researchId: { in: ["r1"] }, status: "ACCEPTED", hiddenAt: null },
        },
      },
    ])
  })

  it("ocultos: restringe às pesquisas pedidas ou a qualquer uma", () => {
    expect(hiddenInResearches(["r1"])[0]).toEqual({
      researchId: { in: ["r1"] },
      primaryHiddenAt: { not: null },
    })
    expect(hiddenInResearches()).toEqual([
      { primaryHiddenAt: { not: null } },
      { participations: { some: { status: "ACCEPTED", hiddenAt: { not: null } } } },
    ])
  })
})
