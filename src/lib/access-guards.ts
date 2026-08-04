// MARES — Regras de acesso à área que exige vínculo com grupo de pesquisa.
//
// Funções puras, sem I/O: recebem o usuário já carregado e devolvem para onde ele deve ir.
// Quem chama (os layouts e páginas) cuida de buscar os dados e executar o redirect.
//
// Por que a regra mora aqui e não nos componentes: ela precisa valer em DOIS pontos, que
// cobrem caminhos de navegação diferentes —
//
//   1. src/app/app/(with-organization)/layout.tsx → carregamento direto da URL, F5.
//   2. src/app/app/(with-organization)/dashboard/page.tsx → navegação por clique. As demais
//      telas do grupo redirecionam para o dashboard quando não há organização ativa, então
//      ele é o funil. Numa navegação client-side o Next.js pode reaproveitar o layout
//      compartilhado em vez de reexecutá-lo, e sem o guard do funil a pessoa cairia num
//      dashboard zerado.
//
// Centralizar evita que os dois pontos divirjam, e torna a regra testável sem montar
// componente nenhum (ver src/lib/__tests__/access-guards.test.ts).

import type { AuthUser, AuthMembership } from "@/lib/auth"

// Para onde mandar quem tenta entrar na área que exige vínculo — null se pode seguir.
// O admin global não participa de organizações mas alcança estas telas (o Glossário está
// na barra lateral dele), por isso é isento.
export function organizationAreaRedirect(user: AuthUser | null): string | null {
  if (!user) return "/login"
  if (user.memberships.length === 0 && !user.isSystemAdmin) return "/app/no-organization"
  return null
}

export type DashboardAccess =
  { kind: "redirect"; to: string } | { kind: "ok"; activeOrg: AuthMembership }

// Decide o acesso ao dashboard. Quando libera, devolve a organização ativa já resolvida —
// assim quem chama não precisa procurá-la de novo nem lidar com um caso nulo impossível.
//
// O `activeOrgId` vem de um cookie (ver getActiveOrgId), então NÃO é confiável sozinho:
// exigimos que exista um vínculo correspondente. É o que protege o cenário de alguém ser
// removida do grupo enquanto o cookie ainda aponta para ele.
export function resolveDashboardAccess(
  user: AuthUser | null,
  activeOrgId: string | null,
): DashboardAccess {
  if (!user) return { kind: "redirect", to: "/login" }

  // Admin global sem organização não tem o que agregar: sua tela inicial são as solicitações.
  if (user.isSystemAdmin && !activeOrgId) {
    return { kind: "redirect", to: "/app/admin/access-requests" }
  }

  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId)
  if (!activeOrg) return { kind: "redirect", to: "/app/no-organization" }

  return { kind: "ok", activeOrg }
}
