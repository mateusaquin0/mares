import { describe, it, expect } from "vitest"
import { formatDateOnly } from "@/lib/date"

describe("formatDateOnly", () => {
  // Regressão do commit ad140d6: datas "somente dia" são gravadas à meia-noite UTC e
  // NÃO podem deslocar o dia ao formatar (no Brasil, UTC-3, exibiria o dia anterior).
  it("formata em UTC sem deslocar o dia (fuso)", () => {
    const iso = "2026-03-15T00:00:00.000Z"
    expect(formatDateOnly(iso, "pt-BR")).toBe("15/03/2026")
  })

  it("aceita objeto Date além de string ISO", () => {
    const d = new Date("2026-12-31T00:00:00.000Z")
    expect(formatDateOnly(d, "pt-BR")).toBe("31/12/2026")
  })

  it("respeita o locale", () => {
    const iso = "2026-01-05T00:00:00.000Z"
    expect(formatDateOnly(iso, "en-US")).toBe("1/5/2026")
  })

  it("aceita opções de formatação do Intl", () => {
    const iso = "2026-01-05T00:00:00.000Z"
    const out = formatDateOnly(iso, "pt-BR", { month: "long", day: "numeric" })
    expect(out).toContain("5")
  })

  it("retorna string vazia para valores ausentes ou inválidos", () => {
    expect(formatDateOnly(null, "pt-BR")).toBe("")
    expect(formatDateOnly(undefined, "pt-BR")).toBe("")
    expect(formatDateOnly("não-é-data", "pt-BR")).toBe("")
  })
})
