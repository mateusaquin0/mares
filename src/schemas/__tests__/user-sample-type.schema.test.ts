import { describe, it, expect } from "vitest"
import { sampleTypeKey, userSampleTypeSchema } from "@/schemas/user-sample-type.schema"
import { LIMITS } from "@/schemas/limits"

describe("userSampleTypeSchema", () => {
  it("apara espaços em volta do valor", () => {
    const parsed = userSampleTypeSchema.parse({ value: "  DNA extraído  " })
    expect(parsed.value).toBe("DNA extraído")
  })

  it("rejeita valor vazio ou só com espaços", () => {
    expect(userSampleTypeSchema.safeParse({ value: "" }).success).toBe(false)
    expect(userSampleTypeSchema.safeParse({ value: "   " }).success).toBe(false)
  })

  it("rejeita valor acima do limite de nome", () => {
    expect(userSampleTypeSchema.safeParse({ value: "a".repeat(LIMITS.name + 1) }).success).toBe(
      false,
    )
  })
})

describe("sampleTypeKey", () => {
  it("iguala variações de caixa, acento e espaço repetido", () => {
    expect(sampleTypeKey("DNA extraído")).toBe(sampleTypeKey("dna  EXTRAIDO"))
    expect(sampleTypeKey(" Tecido Fresco ")).toBe(sampleTypeKey("tecido fresco"))
  })

  it("mantém termos distintos separados", () => {
    expect(sampleTypeKey("lâmina")).not.toBe(sampleTypeKey("parafina"))
  })
})
