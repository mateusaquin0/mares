// Cenário que estes testes protegem: alguém perde o vínculo com o grupo de pesquisa
// (sai por conta própria, ou é removida) ENQUANTO está com o sistema aberto. A sessão
// continua válida — vínculo é dado de aplicação, não de autenticação —, então o acesso
// precisa ser barrado pelas telas, e a pessoa levada para onde há explicação e botão de sair.
//
// A regra vive em dois pontos (layout do grupo e dashboard) porque eles cobrem caminhos de
// navegação diferentes; ver o cabeçalho de src/lib/access-guards.ts. É fácil alguém remover
// um dos dois achando que é duplicação — daí valer a pena travar o comportamento.

import { describe, it, expect } from "vitest"
import { organizationAreaRedirect, resolveDashboardAccess } from "@/lib/access-guards"
import type { AuthUser, AuthMembership } from "@/lib/auth"

const ORG: AuthMembership = { orgId: "org1", orgName: "Grupo A", role: "RESEARCHER" }

function user(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "pesquisadora@usp.br",
    name: "Pesquisadora",
    isSystemAdmin: false,
    memberships: [],
    ...over,
  }
}

describe("organizationAreaRedirect — entrada direta na área (URL, F5)", () => {
  it("manda para a tela dedicada quem não tem vínculo", () => {
    expect(organizationAreaRedirect(user())).toBe("/app/no-organization")
  })

  it("deixa passar quem tem vínculo", () => {
    expect(organizationAreaRedirect(user({ memberships: [ORG] }))).toBeNull()
  })

  // O admin global não participa de organizações, mas alcança telas do grupo (o Glossário
  // está na barra lateral dele). Se este teste quebrar, ele ficou trancado fora da área.
  it("deixa passar o admin global mesmo sem vínculo", () => {
    expect(organizationAreaRedirect(user({ isSystemAdmin: true }))).toBeNull()
  })

  it("manda para o login quem não tem sessão", () => {
    expect(organizationAreaRedirect(null)).toBe("/login")
  })
})

describe("resolveDashboardAccess — funil da navegação por clique", () => {
  it("manda para a tela dedicada quem perdeu o vínculo durante a navegação", () => {
    expect(resolveDashboardAccess(user(), null)).toEqual({
      kind: "redirect",
      to: "/app/no-organization",
    })
  })

  // O id da organização ativa vem de cookie: sobrevive à remoção do vínculo. Aceitá-lo sem
  // conferir os memberships deixaria a pessoa removida seguir usando a tela.
  it("não confia no cookie: sem membership correspondente, redireciona", () => {
    expect(resolveDashboardAccess(user(), "org-que-nao-e-mais-dela")).toEqual({
      kind: "redirect",
      to: "/app/no-organization",
    })
  })

  it("redireciona quando o cookie aponta para um grupo do qual ela saiu, tendo outro", () => {
    const outroGrupo = { ...ORG, orgId: "org2", orgName: "Grupo B" }
    expect(resolveDashboardAccess(user({ memberships: [outroGrupo] }), "org1")).toEqual({
      kind: "redirect",
      to: "/app/no-organization",
    })
  })

  it("manda o admin global sem organização para a área administrativa", () => {
    expect(resolveDashboardAccess(user({ isSystemAdmin: true }), null)).toEqual({
      kind: "redirect",
      to: "/app/admin/access-requests",
    })
  })

  it("libera e devolve a organização ativa resolvida", () => {
    expect(resolveDashboardAccess(user({ memberships: [ORG] }), "org1")).toEqual({
      kind: "ok",
      activeOrg: ORG,
    })
  })

  it("manda para o login quem não tem sessão", () => {
    expect(resolveDashboardAccess(null, null)).toEqual({ kind: "redirect", to: "/login" })
  })
})
