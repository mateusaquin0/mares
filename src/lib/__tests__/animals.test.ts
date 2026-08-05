// Cenário que estes testes protegem: os identificadores do animal (ID de controle, Nº SIMBA)
// são únicos por ORGANIZAÇÃO, mas a listagem de animais é filtrada por PESQUISA. Quem tenta
// cadastrar um ID já usado numa pesquisa que não enxerga recebia "já cadastrado" e não
// encontrava o registro em lugar nenhum — erro sem saída (bug reportado com o ID 312/25).
//
// A regra: quando o duplicado está FORA do escopo do usuário, a mensagem nomeia a pesquisa
// que o detém, para que ele saiba a quem pedir acesso. Dentro do escopo, mensagem genérica
// (ele consegue achar o registro sozinho).

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

const findFirst = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { animal: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}))

const { animalDuplicateConflict, animalDuplicateError } = await import("@/lib/animals")
const { ERROR_CODES } = await import("@/lib/error-codes")

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  })
}

// Animal em conflito: pesquisa primária "r-oculta", sem participações.
function clash(over: Record<string, unknown> = {}) {
  return {
    id: "a-oculto",
    researchId: "r-oculta",
    research: { name: "Cetáceos SC 2025" },
    species: "Sotalia guianensis",
    eventDate: new Date("2025-03-10T00:00:00.000Z"),
    municipality: "Florianópolis",
    state: "SC",
    participations: [],
    ...over,
  }
}

// Identidade mínima devolvida junto do conflito fora de escopo, para a UI permitir comparar
// com o que a pessoa digitou antes de pedir o compartilhamento.
const IDENTITY = {
  animalId: "a-oculto",
  species: "Sotalia guianensis",
  eventDate: "2025-03-10T00:00:00.000Z",
  location: "Florianópolis, SC",
}

describe("animalDuplicateError — identifica QUAL campo duplicou", () => {
  it("distingue ID de controle, Nº SIMBA e desconhecido", () => {
    expect(animalDuplicateError(p2002(["orgId", "controlId"])).code).toBe(
      ERROR_CODES.animalControlDuplicate,
    )
    expect(animalDuplicateError(p2002(["orgId", "simbaRecordNumber"])).code).toBe(
      ERROR_CODES.animalSimbaDuplicate,
    )
    expect(animalDuplicateError(p2002(["outroIndice"])).code).toBe(ERROR_CODES.animalDuplicate)
  })
})

describe("animalDuplicateConflict — duplicado fora do escopo do usuário", () => {
  beforeEach(() => findFirst.mockReset())

  it("nomeia a pesquisa quando o pesquisador não enxerga o registro em conflito", async () => {
    findFirst.mockResolvedValueOnce(clash())
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      orgId: "org1",
      scope: { all: false, ids: ["r-minha"] },
      controlId: "312/25",
    })
    expect(err.code).toBe(ERROR_CODES.animalControlDuplicateOutOfScope)
    // `animalId` + identidade viajam junto para a UI oferecer "pedir o indivíduo para a
    // minha pesquisa" e permitir conferir se é mesmo o mesmo animal.
    expect(err.params).toEqual({ research: "Cetáceos SC 2025", ...IDENTITY })
  })

  it("faz o mesmo para o Nº SIMBA", async () => {
    findFirst.mockResolvedValueOnce(clash())
    const err = await animalDuplicateConflict(p2002(["orgId", "simbaRecordNumber"]), {
      orgId: "org1",
      scope: { all: false, ids: ["r-minha"] },
      simbaRecordNumber: "SIMBA-9",
    })
    expect(err.code).toBe(ERROR_CODES.animalSimbaDuplicateOutOfScope)
    expect(err.params).toEqual({ research: "Cetáceos SC 2025", ...IDENTITY })
  })

  // Mesmo enxergando o registro, "já cadastrado" sem dizer ONDE obriga a caçá-lo entre as
  // pesquisas. A mensagem nomeia a pesquisa; o que ela NÃO faz é oferecer compartilhamento
  // (o indivíduo já está ao alcance) nem expor identidade (ele pode abrir o registro).
  it("nomeia a pesquisa também quando o usuário JÁ a enxerga, sem oferecer compartilhamento", async () => {
    findFirst.mockResolvedValueOnce(clash({ researchId: "r-minha" }))
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      orgId: "org1",
      scope: { all: false, ids: ["r-minha"] },
      controlId: "312/25",
    })
    expect(err.code).toBe(ERROR_CODES.animalControlDuplicateInResearch)
    // `animalId` sem a identidade: visível, a pessoa abre o registro (botão "abrir").
    expect(err.params).toEqual({ research: "Cetáceos SC 2025", animalId: "a-oculto" })
  })

  // O conjunto efetivo de pesquisas do animal é {researchId} ∪ participations: basta uma
  // participação no escopo para o registro ser localizável na listagem.
  it("considera visível quando o escopo alcança apenas uma PARTICIPAÇÃO", async () => {
    findFirst.mockResolvedValueOnce(clash({ participations: [{ researchId: "r-minha" }] }))
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      orgId: "org1",
      scope: { all: false, ids: ["r-minha"] },
      controlId: "312/25",
    })
    expect(err.code).toBe(ERROR_CODES.animalControlDuplicateInResearch)
  })

  it("admin da org enxerga tudo → nomeia a pesquisa, sem oferecer compartilhamento", async () => {
    findFirst.mockResolvedValueOnce(clash())
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      orgId: "org1",
      scope: { all: true },
      controlId: "312/25",
    })
    expect(err.code).toBe(ERROR_CODES.animalControlDuplicateInResearch)
    expect(err.params).toEqual({ research: "Cetáceos SC 2025", animalId: "a-oculto" })
  })

  it("cai no erro genérico quando o valor em conflito não foi informado (PUT parcial)", async () => {
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      orgId: "org1",
      scope: { all: false, ids: ["r-minha"] },
    })
    expect(err.code).toBe(ERROR_CODES.animalControlDuplicate)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("cai no erro genérico quando o animal em conflito não é localizável", async () => {
    findFirst.mockResolvedValueOnce(null)
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      orgId: "org1",
      scope: { all: false, ids: ["r-minha"] },
      controlId: "312/25",
    })
    expect(err.code).toBe(ERROR_CODES.animalControlDuplicate)
  })
})
