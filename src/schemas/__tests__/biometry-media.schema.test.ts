import { describe, it, expect } from "vitest"
import { MAX_MEASURES, saveBiometrySchema } from "@/schemas/biometry.schema"
import { updateMediaSchema } from "@/schemas/media.schema"
import { LIMITS } from "@/schemas/limits"

const messages = (r: { error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? []

describe("saveBiometrySchema", () => {
  it("aceita o bloco completo e mantém a ordem das medidas", () => {
    const data = saveBiometrySchema.parse({
      group: "Odontoceti",
      unit: "Cm",
      measures: [
        { label: "Comprimento total", value: 198 },
        { label: "Número de dentes", value: 0 },
      ],
    })
    expect(data).toEqual({
      group: "Odontoceti",
      unit: "Cm",
      measures: [
        { label: "Comprimento total", value: 198 },
        { label: "Número de dentes", value: 0 },
      ],
    })
  })

  it("grupo e unidade ausentes viram null (cadastro manual de grupo ainda sem nome)", () => {
    const data = saveBiometrySchema.parse({ measures: [] })
    expect(data.group).toBeNull()
    expect(data.unit).toBeNull()
  })

  it("medida sem valor (ausente ou null) é 'não informado' — null, nunca undefined", () => {
    const data = saveBiometrySchema.parse({
      measures: [{ label: "Peso total" }, { label: "Comprimento total", value: null }],
    })
    expect(data.measures.map((m) => m.value)).toEqual([null, null])
  })

  it("recusa rótulo vazio com a chave 'required'", () => {
    const r = saveBiometrySchema.safeParse({ measures: [{ label: "", value: 1 }] })
    expect(messages(r)).toContain("required")
  })

  it("recusa valor negativo ('min') e valor não numérico ('number')", () => {
    expect(
      messages(saveBiometrySchema.safeParse({ measures: [{ label: "a", value: -0.1 }] })),
    ).toContain("min")
    expect(
      messages(saveBiometrySchema.safeParse({ measures: [{ label: "a", value: "12" }] })),
    ).toContain("number")
    expect(
      saveBiometrySchema.safeParse({ measures: [{ label: "a", value: Number.POSITIVE_INFINITY }] })
        .success,
    ).toBe(false)
  })

  // A comparação entre indivíduos é feita pelo rótulo normalizado: dois valores sob o mesmo
  // rótulo tornariam a leitura ambígua.
  it("recusa rótulo repetido, ignorando caixa, acento e espaços", () => {
    const r = saveBiometrySchema.safeParse({
      measures: [
        { label: "Comprimento  Total", value: 1 },
        { label: "comprimento total", value: 2 },
      ],
    })
    expect(messages(r)).toEqual(["duplicateLabel"])

    const acento = saveBiometrySchema.safeParse({
      measures: [
        { label: "Número de dentes", value: 1 },
        { label: "NUMERO DE DENTES", value: 2 },
      ],
    })
    expect(messages(acento)).toEqual(["duplicateLabel"])
  })

  it("limita a quantidade de medidas por indivíduo", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `medida ${i}`, value: i }))
    expect(saveBiometrySchema.safeParse({ measures: many(MAX_MEASURES) }).success).toBe(true)
    expect(saveBiometrySchema.safeParse({ measures: many(MAX_MEASURES + 1) }).success).toBe(false)
  })

  it("respeita os limites de tamanho de grupo, unidade e rótulo", () => {
    const base = { measures: [] }
    expect(
      saveBiometrySchema.safeParse({ ...base, group: "g".repeat(LIMITS.tinyText) }).success,
    ).toBe(true)
    expect(
      saveBiometrySchema.safeParse({ ...base, group: "g".repeat(LIMITS.tinyText + 1) }).success,
    ).toBe(false)
    expect(
      saveBiometrySchema.safeParse({ ...base, unit: "u".repeat(LIMITS.measureUnit + 1) }).success,
    ).toBe(false)
    expect(
      saveBiometrySchema.safeParse({
        measures: [{ label: "l".repeat(LIMITS.name + 1), value: 1 }],
      }).success,
    ).toBe(false)
  })

  it("exige a lista de medidas", () => {
    expect(saveBiometrySchema.safeParse({ group: "Odontoceti" }).success).toBe(false)
  })
})

describe("updateMediaSchema", () => {
  it("apara a legenda; vazio limpa; ausente não mexe", () => {
    expect(updateMediaSchema.parse({ label: "  lâmina 3 " })).toEqual({ label: "lâmina 3" })
    expect(updateMediaSchema.parse({ label: "" })).toEqual({ label: null })
    expect(updateMediaSchema.parse({ label: null })).toEqual({ label: null })
    expect(updateMediaSchema.parse({}).label).toBeUndefined()
  })

  // A legenda descreve o achado, não só nomeia o arquivo: o teto é o das observações.
  it("o limite é o de texto longo, não o de nome", () => {
    expect(updateMediaSchema.safeParse({ label: "x".repeat(LIMITS.longText) }).success).toBe(true)
    expect(updateMediaSchema.safeParse({ label: "x".repeat(LIMITS.longText + 1) }).success).toBe(
      false,
    )
  })
})
