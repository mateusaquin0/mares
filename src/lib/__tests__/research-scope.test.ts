// Escopo por pesquisa (docs/PERMISSOES.md): admin da organização vê todas as pesquisas;
// pesquisador, só as de que é MEMBRO. E o fluxo que liga os dois mundos: pedir acesso a uma
// pesquisa do próprio grupo e ter o pedido aprovado ou recusado por quem a gere.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}))
vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { arg, m, resetDb, root } from "./helpers/prisma-mock"
import type { AuthUser } from "@/lib/auth"
import { ForbiddenError } from "@/lib/errors"
import {
  assertAnimalVisible,
  assertResearchVisible,
  canManageResearch,
  getResearchScope,
  isAnimalVisible,
} from "@/lib/research-access"
import {
  approveResearchAccess,
  countReviewableAccessRequests,
  listReviewableAccessRequests,
  loadAccessRequest,
  myAccessRequestStatus,
  rejectResearchAccess,
  requestResearchAccess,
} from "@/lib/research-requests"

const user = (role: "RESEARCHER" | "ORG_ADMIN" | null, id = "u1"): AuthUser => ({
  id,
  email: `${id}@test.local`,
  name: null,
  isSystemAdmin: false,
  memberships: role ? [{ orgId: "org-a", orgName: "Org A", role }] : [],
})
const admin = user("ORG_ADMIN")
const researcher = user("RESEARCHER")

beforeEach(() => resetDb())

describe("getResearchScope", () => {
  it("admin da organização enxerga tudo, sem consultar o banco", async () => {
    await expect(getResearchScope(admin, "org-a")).resolves.toEqual({ all: true })
    expect(m("research", "findMany")).not.toHaveBeenCalled()
  })

  it("pesquisador enxerga só as pesquisas da organização de que é membro", async () => {
    m("research", "findMany").mockResolvedValue([{ id: "r1" }, { id: "r2" }])
    await expect(getResearchScope(researcher, "org-a")).resolves.toEqual({
      all: false,
      ids: ["r1", "r2"],
    })
    // O vínculo é por ResearchMember, não por ter criado a pesquisa.
    expect(arg(m("research", "findMany")).where).toEqual({
      orgId: "org-a",
      members: { some: { userId: "u1" } },
    })
  })

  it("quem não pertence à organização é barrado (inclusive o admin de OUTRA organização)", async () => {
    await expect(getResearchScope(user(null), "org-a")).rejects.toThrow(ForbiddenError)
    await expect(getResearchScope(admin, "org-b")).rejects.toThrow(ForbiddenError)
  })
})

describe("canManageResearch", () => {
  it("gere a pesquisa o admin da organização ou quem a criou", () => {
    expect(canManageResearch(admin, "org-a", { createdById: "outro" })).toBe(true)
    expect(canManageResearch(researcher, "org-a", { createdById: "u1" })).toBe(true)
    expect(canManageResearch(researcher, "org-a", { createdById: "outro" })).toBe(false)
    expect(canManageResearch(researcher, "org-a", { createdById: null })).toBe(false)
  })

  it("ser admin em outra organização não dá gestão nesta", () => {
    expect(canManageResearch(admin, "org-b", { createdById: "outro" })).toBe(false)
  })
})

describe("assertResearchVisible", () => {
  it("admin passa para qualquer pesquisa", async () => {
    await expect(assertResearchVisible(admin, "org-a", "qualquer")).resolves.toBeUndefined()
  })

  it("pesquisador só passa nas pesquisas do próprio escopo", async () => {
    m("research", "findMany").mockResolvedValue([{ id: "r1" }])
    await expect(assertResearchVisible(researcher, "org-a", "r1")).resolves.toBeUndefined()
    await expect(assertResearchVisible(researcher, "org-a", "r9")).rejects.toThrow(ForbiddenError)
  })
})

describe("visibilidade do indivíduo", () => {
  it("admin vê qualquer indivíduo da organização sem consulta extra", async () => {
    await expect(isAnimalVisible(admin, "org-a", "a1")).resolves.toBe(true)
    expect(m("animal", "findFirst")).not.toHaveBeenCalled()
  })

  // Conjunto efetivo = pesquisa primária ∪ participações ACEITAS (convite pendente não conta).
  it("pesquisador: a consulta cruza a organização com o conjunto efetivo de pesquisas", async () => {
    m("research", "findMany").mockResolvedValue([{ id: "r1" }])
    m("animal", "findFirst").mockResolvedValue({ id: "a1" })
    await expect(isAnimalVisible(researcher, "org-a", "a1")).resolves.toBe(true)
    expect(arg(m("animal", "findFirst")).where).toEqual({
      id: "a1",
      orgId: "org-a",
      OR: [
        { researchId: { in: ["r1"] } },
        { participations: { some: { researchId: { in: ["r1"] }, status: "ACCEPTED" } } },
      ],
    })
  })

  it("indivíduo fora do escopo: a versão booleana responde false e o assert barra", async () => {
    m("research", "findMany").mockResolvedValue([{ id: "r1" }])
    m("animal", "findFirst").mockResolvedValue(null)
    await expect(isAnimalVisible(researcher, "org-a", "a9")).resolves.toBe(false)
    await expect(assertAnimalVisible(researcher, "org-a", "a9")).rejects.toThrow(ForbiddenError)
  })

  it("o assert devolve o escopo para o chamador filtrar as amostras", async () => {
    m("research", "findMany").mockResolvedValue([{ id: "r1" }])
    m("animal", "findFirst").mockResolvedValue({ id: "a1" })
    await expect(assertAnimalVisible(researcher, "org-a", "a1")).resolves.toEqual({
      all: false,
      ids: ["r1"],
    })
    await expect(assertAnimalVisible(admin, "org-a", "a1")).resolves.toEqual({ all: true })
  })
})

describe("requestResearchAccess", () => {
  const KEY = { researchId_userId: { researchId: "r1", userId: "u1" } }

  it("quem já é membro não pede acesso", async () => {
    m("researchMember", "findUnique").mockResolvedValue({ userId: "u1" })
    await expect(requestResearchAccess("r1", "u1")).rejects.toMatchObject({
      name: "ConflictError",
      code: "researchAccessAlreadyMember",
    })
    expect(m("researchAccessRequest", "upsert")).not.toHaveBeenCalled()
  })

  it("pedido ainda pendente não é duplicado", async () => {
    m("researchMember", "findUnique").mockResolvedValue(null)
    m("researchAccessRequest", "findUnique").mockResolvedValue({ id: "q1", status: "PENDING" })
    await expect(requestResearchAccess("r1", "u1")).rejects.toMatchObject({
      code: "researchAccessRequestPending",
    })
    expect(m("researchAccessRequest", "upsert")).not.toHaveBeenCalled()
  })

  it("primeiro pedido: cria a linha com a mensagem (ou null)", async () => {
    m("researchMember", "findUnique").mockResolvedValue(null)
    m("researchAccessRequest", "findUnique").mockResolvedValue(null)
    await requestResearchAccess("r1", "u1")
    const call = arg(m("researchAccessRequest", "upsert"))
    expect(call.where).toEqual(KEY)
    expect(call.create).toEqual({ researchId: "r1", userId: "u1", message: null })
  })

  // Uma linha por par pesquisa×usuário: pedir de novo depois da recusa reaproveita a linha.
  it.each(["REJECTED", "APPROVED"])(
    "pedido anterior %s: reabre como PENDING e apaga a decisão antiga",
    async (status) => {
      m("researchMember", "findUnique").mockResolvedValue(null)
      m("researchAccessRequest", "findUnique").mockResolvedValue({ id: "q1", status })
      await requestResearchAccess("r1", "u1", "agora faço parte do projeto")
      const update = arg<{ update: Record<string, unknown> }>(
        m("researchAccessRequest", "upsert"),
      ).update
      expect(update).toMatchObject({
        status: "PENDING",
        message: "agora faço parte do projeto",
        reviewedById: null,
        reviewedAt: null,
      })
      expect(update.createdAt).toBeInstanceOf(Date)
    },
  )
})

describe("revisão do pedido de acesso", () => {
  const pending = {
    id: "q1",
    status: "PENDING",
    userId: "u2",
    researchId: "r1",
    research: { orgId: "org-a", createdById: "u1" },
  }

  it("pedido inexistente vira 404 próprio", async () => {
    m("researchAccessRequest", "findUnique").mockResolvedValue(null)
    await expect(loadAccessRequest("q0")).rejects.toMatchObject({
      name: "NotFoundError",
      code: "researchAccessRequestNotFound",
    })
  })

  it("aprovar cria o vínculo e registra a decisão NA MESMA transação", async () => {
    m("researchAccessRequest", "findUnique").mockResolvedValue(pending)
    m("researchMember", "upsert").mockReturnValue("op-vinculo")
    m("researchAccessRequest", "update").mockReturnValue("op-decisao")
    await approveResearchAccess("q1", "u1")

    expect(root("$transaction")).toHaveBeenCalledTimes(1)
    expect(arg(root("$transaction"))).toEqual(["op-vinculo", "op-decisao"])
    expect(arg(m("researchMember", "upsert"))).toEqual({
      where: { researchId_userId: { researchId: "r1", userId: "u2" } },
      create: { researchId: "r1", userId: "u2" },
      update: {},
    })
    const decision = arg<{ where: unknown; data: Record<string, unknown> }>(
      m("researchAccessRequest", "update"),
    )
    expect(decision.where).toEqual({ id: "q1" })
    expect(decision.data).toMatchObject({ status: "APPROVED", reviewedById: "u1" })
    expect(decision.data.reviewedAt).toBeInstanceOf(Date)
  })

  it("recusar registra a decisão e NÃO cria vínculo", async () => {
    m("researchAccessRequest", "findUnique").mockResolvedValue(pending)
    await rejectResearchAccess("q1", "u1")
    expect(arg<{ data: unknown }>(m("researchAccessRequest", "update")).data).toMatchObject({
      status: "REJECTED",
      reviewedById: "u1",
    })
    expect(m("researchMember", "upsert")).not.toHaveBeenCalled()
  })

  it.each([
    ["aprovar", approveResearchAccess],
    ["recusar", rejectResearchAccess],
  ])("%s um pedido já respondido é conflito e não grava nada", async (_label, action) => {
    m("researchAccessRequest", "findUnique").mockResolvedValue({ ...pending, status: "APPROVED" })
    await expect(action("q1", "u1")).rejects.toMatchObject({
      name: "ConflictError",
      code: "researchAccessRequestProcessed",
    })
    expect(m("researchAccessRequest", "update")).not.toHaveBeenCalled()
    expect(root("$transaction")).not.toHaveBeenCalled()
  })
})

describe("fila de pedidos que o usuário pode revisar", () => {
  it("admin da organização revisa os pedidos pendentes de todas as pesquisas dela", async () => {
    m("researchAccessRequest", "count").mockResolvedValue(3)
    await expect(countReviewableAccessRequests("org-a", "u1", true)).resolves.toBe(3)
    expect(arg(m("researchAccessRequest", "count")).where).toEqual({
      status: "PENDING",
      research: { orgId: "org-a" },
    })
  })

  // O criador removido da própria pesquisa pelo admin perde a gestão junto com o acesso.
  it("pesquisador revisa só os das pesquisas que criou E ainda integra", async () => {
    m("researchAccessRequest", "count").mockResolvedValue(0)
    await countReviewableAccessRequests("org-a", "u1", false)
    expect(arg(m("researchAccessRequest", "count")).where).toEqual({
      status: "PENDING",
      research: { orgId: "org-a", createdById: "u1", members: { some: { userId: "u1" } } },
    })
  })

  it("a listagem usa o mesmo recorte da contagem e serializa a data", async () => {
    m("researchAccessRequest", "findMany").mockResolvedValue([
      {
        id: "q1",
        message: null,
        createdAt: new Date("2026-03-10T12:00:00.000Z"),
        research: { id: "r1", name: "Sotalia" },
        user: { id: "u2", name: "Bia", email: "bia@test.local" },
      },
    ])
    const rows = await listReviewableAccessRequests("org-a", "u1", false)
    expect(rows[0]?.createdAt).toBe("2026-03-10T12:00:00.000Z")
    expect(rows[0]?.research.name).toBe("Sotalia")
    expect(arg(m("researchAccessRequest", "findMany")).where).toEqual({
      status: "PENDING",
      research: { orgId: "org-a", createdById: "u1", members: { some: { userId: "u1" } } },
    })
  })

  it("o status dos meus pedidos vem indexado por pesquisa, restrito à organização", async () => {
    m("researchAccessRequest", "findMany").mockResolvedValue([
      { researchId: "r1", status: "PENDING" },
      { researchId: "r2", status: "REJECTED" },
    ])
    const map = await myAccessRequestStatus("org-a", "u1")
    expect(map.get("r1")).toBe("PENDING")
    expect(map.get("r2")).toBe("REJECTED")
    expect(map.get("r3")).toBeUndefined()
    expect(arg(m("researchAccessRequest", "findMany")).where).toEqual({
      userId: "u1",
      research: { orgId: "org-a" },
    })
  })
})
