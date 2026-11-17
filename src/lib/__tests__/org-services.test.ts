// Serviços da organização com decisão própria: provisionamento de vínculo (convite × usuário
// existente), ciclo de vida do grupo, protocolos de pesquisa, sessão/organização ativa.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}))
vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

const inviteUser = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({ inviteUser: (email: string) => inviteUser(email) }))

const claims = { sub: null as string | null }
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: claims.sub ? { claims: { sub: claims.sub } } : null }),
    },
  }),
}))

const cookieValue = { current: undefined as string | undefined }
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "mares-active-org" && cookieValue.current
        ? { value: cookieValue.current }
        : undefined,
  }),
}))

import { arg, m, resetDb, root } from "./helpers/prisma-mock"
import {
  ACTIVE_ORG_COOKIE,
  getActiveOrgId,
  getAuthUser,
  requireCatalogReviewer,
  type AuthUser,
} from "@/lib/auth"
import { ForbiddenError } from "@/lib/errors"
import { provisionMembership } from "@/lib/members"
import { deactivateOrgIfEmpty, reactivateOrg } from "@/lib/org-lifecycle"
import { addOrReactivateProtocols, deleteProtocolCascade, setProtocolStatus } from "@/lib/protocols"

beforeEach(() => {
  resetDb()
  inviteUser.mockReset()
  claims.sub = null
  cookieValue.current = undefined
})

describe("provisionMembership", () => {
  const params = { email: "  Ana@Mares.ORG ", orgId: "org-a", role: "RESEARCHER" as const }

  it("normaliza o e-mail (minúsculas, sem espaços) antes de procurar o usuário", async () => {
    m("user", "findUnique").mockResolvedValue({ id: "u1", isSystemAdmin: false })
    m("membership", "findUnique").mockResolvedValue(null)
    await provisionMembership(params)
    expect(arg(m("user", "findUnique")).where).toEqual({ email: "ana@mares.org" })
  })

  it("usuário existente: só cria o vínculo, sem convidar de novo", async () => {
    m("user", "findUnique").mockResolvedValue({ id: "u1", isSystemAdmin: false })
    m("membership", "findUnique").mockResolvedValue(null)
    await expect(provisionMembership(params)).resolves.toEqual({
      userId: "u1",
      role: "RESEARCHER",
      invited: false,
      reusedExistingUser: true,
    })
    expect(arg(m("membership", "create")).data).toEqual({
      userId: "u1",
      orgId: "org-a",
      role: "RESEARCHER",
    })
    expect(inviteUser).not.toHaveBeenCalled()
    expect(m("user", "create")).not.toHaveBeenCalled()
  })

  it("quem já é membro da organização gera conflito e nenhum vínculo novo", async () => {
    m("user", "findUnique").mockResolvedValue({ id: "u1", isSystemAdmin: false })
    m("membership", "findUnique").mockResolvedValue({ userId: "u1", orgId: "org-a" })
    await expect(provisionMembership(params)).rejects.toMatchObject({
      name: "ConflictError",
      code: "alreadyMember",
    })
    expect(m("membership", "create")).not.toHaveBeenCalled()
  })

  // O admin global administra a plataforma por fora: não entra em organização nenhuma.
  it("admin global não pode ser vinculado a uma organização", async () => {
    m("user", "findUnique").mockResolvedValue({ id: "root", isSystemAdmin: true })
    await expect(provisionMembership(params)).rejects.toMatchObject({ code: "systemAdminNoOrg" })
    expect(m("membership", "create")).not.toHaveBeenCalled()
  })

  it.each([
    ["sem nome", undefined],
    ["nome de uma letra", "A"],
    ["nome só com espaços", "    "],
  ])("e-mail novo %s: exige o nome ANTES de disparar o convite", async (_label, name) => {
    m("user", "findUnique").mockResolvedValue(null)
    await expect(provisionMembership({ ...params, name })).rejects.toMatchObject({
      name: "ValidationError",
      code: "nameRequired",
    })
    expect(inviteUser).not.toHaveBeenCalled()
  })

  it("e-mail novo: convida, cria o usuário INVITED com o id do Auth e vincula", async () => {
    m("user", "findUnique").mockResolvedValue(null)
    inviteUser.mockResolvedValue("auth-9")
    await expect(
      provisionMembership({ ...params, name: "  Ana Silva ", role: "ORG_ADMIN" }),
    ).resolves.toEqual({
      userId: "auth-9",
      role: "ORG_ADMIN",
      invited: true,
      reusedExistingUser: false,
    })
    expect(inviteUser).toHaveBeenCalledWith("ana@mares.org")
    expect(arg(m("user", "create")).data).toEqual({
      id: "auth-9",
      email: "ana@mares.org",
      name: "Ana Silva",
      status: "INVITED",
    })
    expect(arg(m("membership", "create")).data).toEqual({
      userId: "auth-9",
      orgId: "org-a",
      role: "ORG_ADMIN",
    })
  })

  it("convite recusado pelo Auth não deixa usuário nem vínculo locais", async () => {
    m("user", "findUnique").mockResolvedValue(null)
    inviteUser.mockRejectedValue(new Error("rate limit"))
    await expect(provisionMembership({ ...params, name: "Ana" })).rejects.toThrow("rate limit")
    expect(m("user", "create")).not.toHaveBeenCalled()
    expect(m("membership", "create")).not.toHaveBeenCalled()
  })
})

// Grupo que fica sem membros é DESATIVADO, não excluído: os dados públicos continuam no mapa.
describe("ciclo de vida do grupo", () => {
  it("desativa quando o último membro sai", async () => {
    m("membership", "count").mockResolvedValue(0)
    await expect(deactivateOrgIfEmpty("org-a")).resolves.toBe(true)
    const call = arg<{ where: unknown; data: { deactivatedAt: unknown } }>(
      m("organization", "update"),
    )
    expect(call.where).toEqual({ id: "org-a" })
    expect(call.data.deactivatedAt).toBeInstanceOf(Date)
  })

  it("com membros restantes não toca no grupo", async () => {
    m("membership", "count").mockResolvedValue(1)
    await expect(deactivateOrgIfEmpty("org-a")).resolves.toBe(false)
    expect(m("organization", "update")).not.toHaveBeenCalled()
  })

  it("reativar só atinge grupo desativado (no-op para grupo ativo)", async () => {
    await reactivateOrg("org-a")
    expect(arg(m("organization", "updateMany"))).toEqual({
      where: { id: "org-a", deactivatedAt: { not: null } },
      data: { deactivatedAt: null },
    })
  })

  it("aceita o client transacional de quem chama", async () => {
    const tx = {
      membership: { count: vi.fn().mockResolvedValue(0) },
      organization: { update: vi.fn(), updateMany: vi.fn() },
    }
    await deactivateOrgIfEmpty("org-a", tx as never)
    await reactivateOrg("org-a", tx as never)
    expect(tx.organization.update).toHaveBeenCalledTimes(1)
    expect(tx.organization.updateMany).toHaveBeenCalledTimes(1)
    expect(m("organization", "update")).not.toHaveBeenCalled()
  })
})

describe("protocolos de pesquisa", () => {
  const combo = { organId: "o1", pathogenId: "p1", examTypeId: "e1" }

  it("excluir a entrada apaga as análises da combinação EXATA, na mesma transação", async () => {
    m("analysis", "deleteMany").mockResolvedValue({ count: 4 })
    await expect(deleteProtocolCascade("proto-1", { researchId: "r1", ...combo })).resolves.toEqual(
      { deletedAnalyses: 4 },
    )

    expect(root("$transaction")).toHaveBeenCalledTimes(1)
    // Amostras DESTA pesquisa e DESTE órgão: a mesma combinação em outra pesquisa fica intacta.
    expect(arg(m("analysis", "deleteMany")).where).toEqual({
      pathogenId: "p1",
      examTypeId: "e1",
      sample: { researchId: "r1", organId: "o1" },
    })
    expect(arg(m("researchProtocol", "delete"))).toEqual({ where: { id: "proto-1" } })
  })

  it("falha ao remover a entrada propaga o erro (a transação desfaz as análises)", async () => {
    m("analysis", "deleteMany").mockResolvedValue({ count: 1 })
    m("researchProtocol", "delete").mockRejectedValue(new Error("FK"))
    await expect(deleteProtocolCascade("proto-1", { researchId: "r1", ...combo })).rejects.toThrow(
      "FK",
    )
  })

  it("lote: cria as inéditas, reativa as inativas e mantém as ativas", async () => {
    m("researchProtocol", "findUnique")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "proto-inativo", status: "INACTIVE" })
      .mockResolvedValueOnce({ id: "proto-ativo", status: "ACTIVE" })

    const result = await addOrReactivateProtocols("r1", [
      combo,
      { ...combo, pathogenId: "p2" },
      { ...combo, pathogenId: "p3" },
    ])

    expect(result).toEqual({ affected: 2 })
    expect(m("researchProtocol", "create")).toHaveBeenCalledTimes(1)
    expect(arg(m("researchProtocol", "create")).data).toEqual({ ...combo, researchId: "r1" })
    expect(m("researchProtocol", "update")).toHaveBeenCalledTimes(1)
    expect(arg(m("researchProtocol", "update"))).toEqual({
      where: { id: "proto-inativo" },
      data: { status: "ACTIVE", deactivatedAt: null },
    })
    expect(arg(m("researchProtocol", "findUnique")).where).toEqual({
      researchId_organId_pathogenId_examTypeId: { researchId: "r1", ...combo },
    })
  })

  it("lote vazio não afeta nada", async () => {
    await expect(addOrReactivateProtocols("r1", [])).resolves.toEqual({ affected: 0 })
  })

  it("desativar carimba a data; reativar a apaga", async () => {
    await setProtocolStatus("proto-1", "INACTIVE")
    const off = arg<{ data: { status: string; deactivatedAt: unknown } }>(
      m("researchProtocol", "update"),
    )
    expect(off.data.status).toBe("INACTIVE")
    expect(off.data.deactivatedAt).toBeInstanceOf(Date)

    await setProtocolStatus("proto-1", "ACTIVE")
    expect(arg(m("researchProtocol", "update"), 1)).toEqual({
      where: { id: "proto-1" },
      data: { status: "ACTIVE", deactivatedAt: null },
    })
  })
})

describe("getAuthUser — sessão → usuário com vínculos", () => {
  it("sem sessão válida devolve null sem consultar o banco", async () => {
    await expect(getAuthUser()).resolves.toBeNull()
    expect(m("user", "findUnique")).not.toHaveBeenCalled()
  })

  // Conta excluída com token ainda válido: o JWT sozinho não autentica ninguém.
  it("token válido de usuário que não existe mais no banco devolve null", async () => {
    claims.sub = "u-apagado"
    m("user", "findUnique").mockResolvedValue(null)
    await expect(getAuthUser()).resolves.toBeNull()
  })

  it("devolve o usuário com os vínculos achatados (organização + papel)", async () => {
    claims.sub = "u1"
    m("user", "findUnique").mockResolvedValue({
      id: "u1",
      email: "ana@mares.org",
      name: "Ana",
      isSystemAdmin: false,
      memberships: [
        { orgId: "org-a", role: "ORG_ADMIN", organization: { name: "LabMar" } },
        { orgId: "org-b", role: "RESEARCHER", organization: { name: "Aquário" } },
      ],
    })
    await expect(getAuthUser()).resolves.toEqual({
      id: "u1",
      email: "ana@mares.org",
      name: "Ana",
      isSystemAdmin: false,
      memberships: [
        { orgId: "org-a", orgName: "LabMar", role: "ORG_ADMIN" },
        { orgId: "org-b", orgName: "Aquário", role: "RESEARCHER" },
      ],
    })
    expect(arg(m("user", "findUnique")).where).toEqual({ id: "u1" })
  })
})

describe("getActiveOrgId — organização ativa pelo cookie", () => {
  const user = (orgIds: string[]): AuthUser => ({
    id: "u1",
    email: "u1@test.local",
    name: null,
    isSystemAdmin: false,
    memberships: orgIds.map((orgId) => ({ orgId, orgName: orgId, role: "RESEARCHER" })),
  })

  it("o cookie tem o nome combinado com o cliente", () => {
    expect(ACTIVE_ORG_COOKIE).toBe("mares-active-org")
  })

  it("usuário sem vínculo não tem organização ativa", async () => {
    cookieValue.current = "org-a"
    await expect(getActiveOrgId(user([]))).resolves.toBeNull()
  })

  it("usa o cookie quando ele aponta para uma organização do usuário", async () => {
    cookieValue.current = "org-b"
    await expect(getActiveOrgId(user(["org-a", "org-b"]))).resolves.toBe("org-b")
  })

  // O cookie é controlado pelo cliente: não pode escolher uma organização alheia.
  it("cookie de organização em que o usuário NÃO tem vínculo é ignorado", async () => {
    cookieValue.current = "org-alheia"
    await expect(getActiveOrgId(user(["org-a", "org-b"]))).resolves.toBe("org-a")
  })

  it("sem cookie, vale a primeira organização do usuário", async () => {
    await expect(getActiveOrgId(user(["org-a", "org-b"]))).resolves.toBe("org-a")
  })
})

describe("requireCatalogReviewer", () => {
  const base = { id: "u1", email: "u1@test.local", name: null }
  it("curadoria do glossário: admin de grupo ou global; pesquisador não", () => {
    const orgAdmin: AuthUser = {
      ...base,
      isSystemAdmin: false,
      memberships: [{ orgId: "org-a", orgName: "A", role: "ORG_ADMIN" }],
    }
    const researcher: AuthUser = {
      ...base,
      isSystemAdmin: false,
      memberships: [{ orgId: "org-a", orgName: "A", role: "RESEARCHER" }],
    }
    expect(() => requireCatalogReviewer(orgAdmin)).not.toThrow()
    expect(() =>
      requireCatalogReviewer({ ...base, isSystemAdmin: true, memberships: [] }),
    ).not.toThrow()
    expect(() => requireCatalogReviewer(researcher)).toThrow(ForbiddenError)
  })
})
