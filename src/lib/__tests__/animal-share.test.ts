// Regra central do compartilhamento de indivíduo: quem responde é sempre o lado que ainda
// NÃO consentiu. Se o mapeamento origem → quem decide inverter, quem pediu passaria a poder
// aprovar o próprio pedido — que é exatamente o que o fluxo existe para impedir.
//
//   INVITE  (partiu de quem enxerga o indivíduo)  → decide a pesquisa CONVIDADA.
//   REQUEST (partiu de quem quer o indivíduo)     → decide a pesquisa PRIMÁRIA do indivíduo.

import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { animalResearch: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))

const { loadAnimalShare } = await import("@/lib/animals")
const { ERROR_CODES } = await import("@/lib/error-codes")

// Vínculo entre o indivíduo (primária "r-origem") e a pesquisa "r-convidada".
function share(origin: "INVITE" | "REQUEST") {
  return {
    status: "PENDING" as const,
    origin,
    researchId: "r-convidada",
    animal: { orgId: "org1", researchId: "r-origem" },
  }
}

describe("loadAnimalShare — quem responde ao compartilhamento", () => {
  beforeEach(() => findUnique.mockReset())

  it("convite: decide a pesquisa convidada; cancela quem convidou (a de origem)", async () => {
    findUnique.mockResolvedValueOnce(share("INVITE"))
    const s = await loadAnimalShare("a1", "r-convidada")
    expect(s.deciderResearchId).toBe("r-convidada")
    expect(s.requesterResearchId).toBe("r-origem")
  })

  it("pedido: decide a pesquisa de origem do indivíduo; cancela quem pediu", async () => {
    findUnique.mockResolvedValueOnce(share("REQUEST"))
    const s = await loadAnimalShare("a1", "r-convidada")
    expect(s.deciderResearchId).toBe("r-origem")
    expect(s.requesterResearchId).toBe("r-convidada")
  })

  it("vínculo inexistente vira 404 de domínio", async () => {
    findUnique.mockResolvedValueOnce(null)
    await expect(loadAnimalShare("a1", "r-x")).rejects.toMatchObject({
      code: ERROR_CODES.animalShareNotFound,
    })
  })
})
