import { describe, it, expect } from "vitest"
import {
  nameI18nSchema,
  examTypeSchema,
  pathogenSchema,
  isCatalogType,
  catalogBodySchema,
} from "@/schemas/catalog.schema"

describe("nameI18nSchema", () => {
  it("exige nome em pt e en", () => {
    expect(nameI18nSchema.safeParse({ namePt: "Encéfalo", nameEn: "Brain" }).success).toBe(true)
    expect(nameI18nSchema.safeParse({ namePt: "Encéfalo", nameEn: "" }).success).toBe(false)
    expect(nameI18nSchema.safeParse({ namePt: "", nameEn: "Brain" }).success).toBe(false)
  })
})

describe("examTypeSchema", () => {
  it("aceita medida quantitativa opcional (vazia = qualitativo)", () => {
    expect(examTypeSchema.safeParse({ namePt: "PCR", nameEn: "PCR" }).success).toBe(true)
    expect(
      examTypeSchema.safeParse({ namePt: "PCR", nameEn: "PCR", measurePt: "Ct", measureEn: "Ct", measureUnit: "" }).success
    ).toBe(true)
  })
})

describe("pathogenSchema", () => {
  it("aceita grupo + nomes opcionais (regra fina fica no servidor)", () => {
    expect(pathogenSchema.safeParse({ groupId: "g1", scientificName: "Toxoplasma gondii" }).success).toBe(true)
  })

  it("exige groupId", () => {
    expect(pathogenSchema.safeParse({ scientificName: "Toxoplasma gondii" }).success).toBe(false)
  })
})

describe("isCatalogType / catalogBodySchema", () => {
  it("reconhece apenas tipos válidos de catálogo", () => {
    expect(isCatalogType("organs")).toBe(true)
    expect(isCatalogType("pathogens")).toBe(true)
    expect(isCatalogType("banana")).toBe(false)
  })

  it("seleciona o schema de patógeno para 'pathogens' e i18n para os demais", () => {
    expect(catalogBodySchema("pathogens")).toBe(pathogenSchema)
    expect(catalogBodySchema("organs")).toBe(nameI18nSchema)
  })
})
