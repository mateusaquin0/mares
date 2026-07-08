import { describe, it, expect, vi, afterEach } from "vitest"
import { matchWormsSpecies } from "@/lib/worms"

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response)
}

afterEach(() => vi.restoreAllMocks())

describe("matchWormsSpecies", () => {
  it("não chama a API para termos com menos de 3 caracteres", async () => {
    const spy = mockFetch(200, [])
    expect(await matchWormsSpecies("So")).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it("prioriza o registro com status 'accepted'", async () => {
    mockFetch(200, [
      [
        {
          AphiaID: 1,
          scientificname: "Sotalia fluviatilis",
          status: "unaccepted",
          family: "Delphinidae",
          order: "Artiodactyla",
        },
        {
          AphiaID: 2,
          scientificname: "Sotalia guianensis",
          status: "accepted",
          family: "Delphinidae",
          order: "Artiodactyla",
          valid_AphiaID: 2,
          valid_name: "Sotalia guianensis",
        },
      ],
    ])
    const m = await matchWormsSpecies("Sotalia guianensis")
    expect(m?.wormsAphiaId).toBe(2)
    expect(m?.acceptedName).toBe("Sotalia guianensis")
    expect(m?.taxonFamily).toBe("Delphinidae")
  })

  it("usa valid_AphiaID/valid_name quando o nome consultado é sinônimo", async () => {
    mockFetch(200, [
      [
        {
          AphiaID: 10,
          scientificname: "nome antigo",
          status: "unaccepted",
          family: null,
          order: null,
          valid_AphiaID: 99,
          valid_name: "Nome Aceito",
        },
      ],
    ])
    const m = await matchWormsSpecies("nome antigo")
    expect(m?.wormsAphiaId).toBe(99)
    expect(m?.acceptedName).toBe("Nome Aceito")
  })

  it("retorna null em 204 (sem correspondência)", async () => {
    mockFetch(204, null)
    expect(await matchWormsSpecies("Inexistente sp")).toBeNull()
  })

  it("retorna null em erro HTTP (best-effort, não bloqueia o import)", async () => {
    mockFetch(500, null)
    expect(await matchWormsSpecies("Qualquer especie")).toBeNull()
  })

  it("retorna null se o fetch lançar (rede)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"))
    expect(await matchWormsSpecies("Qualquer especie")).toBeNull()
  })
})
