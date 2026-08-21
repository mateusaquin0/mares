// Cenário que estes testes protegem: o arquivo passou a pertencer a uma PESQUISA
// (AnimalMedia.researchId, migration 20260820010000), não ao indivíduo inteiro. Num indivíduo
// compartilhado, quem enxerga o indivíduo por uma pesquisa não deve ver os arquivos da outra —
// e o escopo de quem exclui sai daqui, não do animal.

import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { animalMedia: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))

const { loadMediaOrg } = await import("@/lib/media")

const PARTICIPANTE = "r-participante"
const ORG = "org-1"

beforeEach(() => findUnique.mockReset())

describe("loadMediaOrg — escopo pela pesquisa DONA do arquivo", () => {
  it("devolve a pesquisa do arquivo e a org dela", async () => {
    findUnique.mockResolvedValue({
      id: "m-1",
      url: "a-1/arquivo.pdf",
      uploadedById: "u-autor",
      animalId: "a-1",
      researchId: PARTICIPANTE,
      research: { orgId: ORG },
      // O vínculo do animal viaja junto: se o código voltar a tirar o escopo da pesquisa
      // primária do indivíduo, encontra "r-primaria" aqui e o teste acusa.
      animal: { researchId: "r-primaria", research: { orgId: ORG } },
    })

    const media = await loadMediaOrg("m-1")
    expect(media.researchId).toBe(PARTICIPANTE)
    expect(media.orgId).toBe(ORG)
    expect(media.path).toBe("a-1/arquivo.pdf")
  })

  it("arquivo inexistente vira 404", async () => {
    findUnique.mockResolvedValue(null)
    await expect(loadMediaOrg("m-x")).rejects.toMatchObject({ code: "mediaNotFound" })
  })
})
