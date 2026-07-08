import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { getStates, getCities } from "@/lib/csc"

function mockFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response)
}

beforeEach(() => {
  process.env.CSC_API_KEY = "test-key"
})
afterEach(() => vi.restoreAllMocks())

describe("getStates — guarda anti-SSRF", () => {
  it("retorna [] e NÃO chama a API para ISO fora do padrão (anti path-injection)", async () => {
    const spy = mockFetch([])
    expect(await getStates("../../etc")).toEqual([])
    expect(await getStates("BR;DROP")).toEqual([])
    expect(await getStates("")).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it("consulta e ordena os estados para um ISO válido", async () => {
    mockFetch([
      { id: 2, name: "São Paulo", iso2: "SP" },
      { id: 1, name: "Acre", iso2: "AC" },
    ])
    const states = await getStates("BR")
    expect(states.map((s) => s.name)).toEqual(["Acre", "São Paulo"]) // ordenado
  })
})

describe("getCities — guarda anti-SSRF", () => {
  it("valida ambos os ISO antes de consultar", async () => {
    const spy = mockFetch([])
    expect(await getCities("BR", "../x")).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it("consulta e ordena as cidades para ISO válidos", async () => {
    mockFetch([
      { id: 2, name: "Joinville" },
      { id: 1, name: "Blumenau" },
    ])
    const cities = await getCities("BR", "SC")
    expect(cities.map((c) => c.name)).toEqual(["Blumenau", "Joinville"])
  })
})
