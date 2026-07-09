import { describe, it, expect } from "vitest"
import { positivityRate } from "@/lib/dashboard"

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
