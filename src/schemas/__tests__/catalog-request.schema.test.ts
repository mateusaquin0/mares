import { describe, it, expect } from "vitest"

import {
  createCatalogRequestSchema,
  catalogRequestPayloadSchema,
} from "@/schemas/catalog-request.schema"

describe("createCatalogRequestSchema", () => {
  it("aceita um tipo válido + payload objeto", () => {
    const r = createCatalogRequestSchema.safeParse({
      type: "organs",
      payload: { namePt: "Fígado", nameEn: "Liver" },
    })
    expect(r.success).toBe(true)
  })

  it("rejeita tipo desconhecido", () => {
    const r = createCatalogRequestSchema.safeParse({ type: "foo", payload: {} })
    expect(r.success).toBe(false)
  })
})

describe("catalogRequestPayloadSchema", () => {
  it("organs/exam-types exigem nome PT e EN", () => {
    expect(
      catalogRequestPayloadSchema("organs").safeParse({ namePt: "", nameEn: "" }).success,
    ).toBe(false)
    expect(
      catalogRequestPayloadSchema("organs").safeParse({ namePt: "Rim", nameEn: "Kidney" }).success,
    ).toBe(true)
  })

  it("exam-types valida a medida opcional", () => {
    const schema = catalogRequestPayloadSchema("exam-types")
    expect(
      schema.safeParse({ namePt: "qPCR", nameEn: "qPCR", measurePt: "Ct", measureEn: "Ct" })
        .success,
    ).toBe(true)
  })

  it("pathogens exige groupId", () => {
    const schema = catalogRequestPayloadSchema("pathogens")
    expect(schema.safeParse({ scientificName: "Toxoplasma gondii" }).success).toBe(false)
    expect(schema.safeParse({ groupId: "g1", scientificName: "Toxoplasma gondii" }).success).toBe(
      true,
    )
  })
})
