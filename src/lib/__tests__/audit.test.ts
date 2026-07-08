import { describe, it, expect } from "vitest"
import { auditStr, diffFields } from "@/lib/audit"

describe("auditStr — normalização de valores", () => {
  it("mapeia vazios (null/undefined/'') para null", () => {
    expect(auditStr(null)).toBeNull()
    expect(auditStr(undefined)).toBeNull()
    expect(auditStr("")).toBeNull()
  })

  it("serializa datas em ISO (comparação estável)", () => {
    expect(auditStr(new Date("2024-01-02T03:04:05.000Z"))).toBe("2024-01-02T03:04:05.000Z")
  })

  it("converte números e booleanos para string", () => {
    expect(auditStr(0)).toBe("0")
    expect(auditStr(12.5)).toBe("12.5")
    expect(auditStr(false)).toBe("false")
    expect(auditStr(true)).toBe("true")
  })
})

describe("diffFields — diferença campo a campo", () => {
  it("retorna apenas os campos que mudaram", () => {
    const before = { species: "Sotalia", controlId: "A1", notes: "x" }
    const after = { species: "Sotalia guianensis", controlId: "A1", notes: "x" }
    expect(diffFields(before, after, ["species", "controlId", "notes"])).toEqual([
      { field: "species", oldValue: "Sotalia", newValue: "Sotalia guianensis" },
    ])
  })

  it("registra transição de preenchido para vazio como null", () => {
    const before = { notes: "algo" }
    const after = { notes: "" }
    expect(diffFields(before, after, ["notes"])).toEqual([
      { field: "notes", oldValue: "algo", newValue: null },
    ])
  })

  it("não considera mudança quando '' e null são equivalentes", () => {
    expect(diffFields({ notes: "" }, { notes: null }, ["notes"])).toEqual([])
  })

  it("compara datas iguais como sem mudança independentemente da instância", () => {
    const before = { d: new Date("2024-05-01T00:00:00.000Z") }
    const after = { d: new Date("2024-05-01T00:00:00.000Z") }
    expect(diffFields(before, after, ["d"])).toEqual([])
  })

  it("retorna [] quando nenhum campo listado mudou", () => {
    const row = { a: 1, b: 2 }
    expect(diffFields(row, { a: 1, b: 999 }, ["a"])).toEqual([])
  })
})
