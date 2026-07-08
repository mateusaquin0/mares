import { describe, it, expect } from "vitest"
import { slugify } from "@/lib/slug"

describe("slugify", () => {
  it("remove acentos e normaliza para minúsculas", () => {
    expect(slugify("Encéfalo")).toBe("encefalo")
    expect(slugify("Sotália")).toBe("sotalia")
  })

  it("usa o separador padrão '_' entre palavras", () => {
    expect(slugify("Vírus da Cinomose")).toBe("virus_da_cinomose")
  })

  it("aceita separador customizado (ex.: '-' para nomes de arquivo)", () => {
    expect(slugify("Baía de Babitonga", "-")).toBe("baia-de-babitonga")
  })

  it("colapsa múltiplos não-alfanuméricos num único separador", () => {
    expect(slugify("a  --  b")).toBe("a_b")
  })

  it("apara separadores das bordas", () => {
    expect(slugify("  olá!  ")).toBe("ola")
    expect(slugify("---x---", "-")).toBe("x")
  })

  it("retorna vazio quando não há caractere alfanumérico", () => {
    expect(slugify("!!!")).toBe("")
    expect(slugify("")).toBe("")
  })
})
