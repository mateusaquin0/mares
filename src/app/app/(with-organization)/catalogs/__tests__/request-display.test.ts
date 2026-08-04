import { describe, it, expect } from "vitest"

import { catalogTypeOfRequest, requestItemName, requestNormalizedNames } from "../request-display"
import type { CatalogRequestItem } from "@/types/catalog-request"

function make(over: Partial<CatalogRequestItem>): CatalogRequestItem {
  return {
    id: "r1",
    type: "ORGAN",
    payload: {},
    status: "PENDING",
    requestedById: "u1",
    requestedByEmail: null,
    orgId: null,
    orgName: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    duplicateOfId: null,
    createdItemId: null,
    createdAt: "2026-07-11T00:00:00Z",
    updatedAt: "2026-07-11T00:00:00Z",
    ...over,
  }
}

describe("catalogTypeOfRequest", () => {
  it("mapeia o enum para o CatalogType", () => {
    expect(catalogTypeOfRequest("ORGAN")).toBe("organs")
    expect(catalogTypeOfRequest("PATHOGEN")).toBe("pathogens")
    expect(catalogTypeOfRequest("EXAM_TYPE")).toBe("exam-types")
  })
})

describe("requestItemName", () => {
  it("patógeno usa o nome científico quando presente", () => {
    const req = make({ type: "PATHOGEN", payload: { scientificName: "Toxoplasma gondii" } })
    expect(requestItemName("pt", req)).toBe("Toxoplasma gondii")
  })

  it("item nomeado usa o rótulo do idioma ativo", () => {
    const req = make({ type: "ORGAN", payload: { namePt: "Fígado", nameEn: "Liver" } })
    expect(requestItemName("pt", req)).toBe("Fígado")
    expect(requestItemName("en", req)).toBe("Liver")
  })
})

describe("requestNormalizedNames", () => {
  it("patógeno científico → slug do nome científico", () => {
    const req = make({ type: "PATHOGEN", payload: { scientificName: "Toxoplasma gondii" } })
    expect(requestNormalizedNames(req)).toEqual(["toxoplasma_gondii"])
  })

  it("item nomeado → slugs de PT e EN (sem acento/caixa)", () => {
    const req = make({ type: "ORGAN", payload: { namePt: "Encéfalo", nameEn: "Brain" } })
    expect(requestNormalizedNames(req)).toEqual(["encefalo", "brain"])
  })
})
