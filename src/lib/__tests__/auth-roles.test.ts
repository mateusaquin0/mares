import { describe, it, expect, vi } from "vitest"

// Fora do Next, o `react` instalado não exporta `cache` (memoização por request).
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import {
  canReviewCatalogRequest,
  isAnyOrgAdmin,
  orgRole,
  requireAnyOrgAdmin,
  requireOrgRole,
  requireSystemAdmin,
  type AuthUser,
} from "@/lib/auth"
import { ForbiddenError } from "@/lib/errors"

// Três papéis (docs/PERMISSOES.md): admin global (User.isSystemAdmin), admin da organização e
// pesquisador (Membership, POR organização). O admin global NÃO pertence a organizações: ele
// administra a plataforma pelas rotas /api/admin e não satisfaz checagens de papel de grupo.

function user(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "u1@test.local",
    name: null,
    isSystemAdmin: false,
    memberships: [],
    ...over,
  }
}
const member = (orgId: string, role: "RESEARCHER" | "ORG_ADMIN") => ({
  orgId,
  orgName: orgId,
  role,
})

const researcher = user({ memberships: [member("org-a", "RESEARCHER")] })
const orgAdmin = user({ memberships: [member("org-a", "ORG_ADMIN")] })
const systemAdmin = user({ isSystemAdmin: true })
const stranger = user()

describe("orgRole", () => {
  it("devolve o papel na organização informada", () => {
    expect(orgRole(researcher, "org-a")).toBe("RESEARCHER")
    expect(orgRole(orgAdmin, "org-a")).toBe("ORG_ADMIN")
  })

  it("devolve null para organização em que o usuário não tem vínculo", () => {
    expect(orgRole(researcher, "org-b")).toBeNull()
    expect(orgRole(stranger, "org-a")).toBeNull()
  })

  it("o papel é por organização: admin em uma, pesquisador em outra", () => {
    const both = user({
      memberships: [member("org-a", "ORG_ADMIN"), member("org-b", "RESEARCHER")],
    })
    expect(orgRole(both, "org-a")).toBe("ORG_ADMIN")
    expect(orgRole(both, "org-b")).toBe("RESEARCHER")
  })
})

describe("requireOrgRole", () => {
  it("pesquisador satisfaz o papel mínimo de pesquisador", () => {
    expect(() => requireOrgRole(researcher, "org-a", "RESEARCHER")).not.toThrow()
  })

  it("admin da organização satisfaz também o papel de pesquisador", () => {
    expect(() => requireOrgRole(orgAdmin, "org-a", "RESEARCHER")).not.toThrow()
    expect(() => requireOrgRole(orgAdmin, "org-a", "ORG_ADMIN")).not.toThrow()
  })

  it("pesquisador NÃO satisfaz o papel de admin da organização", () => {
    expect(() => requireOrgRole(researcher, "org-a", "ORG_ADMIN")).toThrow(ForbiddenError)
  })

  it("membro de uma organização não tem papel em outra", () => {
    expect(() => requireOrgRole(orgAdmin, "org-b", "RESEARCHER")).toThrow(ForbiddenError)
  })

  it("admin global NÃO satisfaz papel de organização", () => {
    expect(() => requireOrgRole(systemAdmin, "org-a", "RESEARCHER")).toThrow(ForbiddenError)
  })
})

describe("requireSystemAdmin", () => {
  it("aceita só o admin global", () => {
    expect(() => requireSystemAdmin(systemAdmin)).not.toThrow()
    expect(() => requireSystemAdmin(orgAdmin)).toThrow(ForbiddenError)
    expect(() => requireSystemAdmin(researcher)).toThrow(ForbiddenError)
  })
})

describe("admin de alguma organização (catálogo global e curadoria)", () => {
  it("admin de grupo e admin global passam", () => {
    expect(isAnyOrgAdmin(orgAdmin)).toBe(true)
    expect(isAnyOrgAdmin(systemAdmin)).toBe(true)
    expect(canReviewCatalogRequest(orgAdmin)).toBe(true)
    expect(() => requireAnyOrgAdmin(orgAdmin)).not.toThrow()
  })

  it("pesquisador e usuário sem vínculo não passam", () => {
    expect(isAnyOrgAdmin(researcher)).toBe(false)
    expect(isAnyOrgAdmin(stranger)).toBe(false)
    expect(canReviewCatalogRequest(researcher)).toBe(false)
    expect(() => requireAnyOrgAdmin(researcher)).toThrow(ForbiddenError)
  })
})
