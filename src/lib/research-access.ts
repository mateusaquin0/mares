// MARES — Escopo de visibilidade por pesquisa.
//
// Regra central (docs/PERMISSOES.md §Escopo por pesquisa):
//   • ORG_ADMIN  → vê TODAS as pesquisas da organização.
//   • RESEARCHER → vê apenas as pesquisas às quais está VINCULADO (ResearchMember) OU que CRIOU.
//
// Este módulo concentra o cálculo do conjunto visível e os asserts reutilizados nas rotas,
// para que o escopo seja idêntico em todo lugar (lista de pesquisas, animais, amostras,
// análises, exports, dashboard, etc.).

import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { orgRole, type AuthUser } from "@/lib/auth"
import { ForbiddenError } from "@/lib/errors"

// { all: true } = admin (sem restrição por pesquisa, ainda escopado pela org).
// { all: false, ids } = pesquisador, com o conjunto exato de pesquisas visíveis.
export type ResearchScope = { all: true } | { all: false; ids: string[] }

// Conjunto de pesquisas visíveis ao usuário na org ativa. Memoizado por request.
export const getResearchScope = cache(
  async (user: AuthUser, orgId: string): Promise<ResearchScope> => {
    const role = orgRole(user, orgId)
    if (!role) throw new ForbiddenError()
    if (role === "ORG_ADMIN") return { all: true }

    const rows = await prisma.research.findMany({
      where: {
        orgId,
        OR: [{ members: { some: { userId: user.id } } }, { createdById: user.id }],
      },
      select: { id: true },
    })
    return { all: false, ids: rows.map((r) => r.id) }
  },
)

// Um pesquisador pode gerir a pesquisa (membros/edição) se for admin da org OU o criador dela.
export function canManageResearch(
  user: AuthUser,
  orgId: string,
  research: { createdById: string | null },
): boolean {
  return orgRole(user, orgId) === "ORG_ADMIN" || research.createdById === user.id
}

// Garante que a pesquisa é visível ao usuário; caso contrário, ForbiddenError.
export async function assertResearchVisible(user: AuthUser, orgId: string, researchId: string) {
  const scope = await getResearchScope(user, orgId)
  if (scope.all) return
  if (!scope.ids.includes(researchId)) throw new ForbiddenError()
}

// Garante que o animal é visível: o conjunto efetivo de pesquisas do indivíduo
// (primária ∪ participações) deve interceptar o escopo do usuário. Admin: sempre visível
// dentro da própria org. Retorna as pesquisas visíveis do animal (útil para escopar amostras).
export async function assertAnimalVisible(
  user: AuthUser,
  orgId: string,
  animalId: string,
): Promise<ResearchScope> {
  const scope = await getResearchScope(user, orgId)
  if (scope.all) return scope

  const animal = await prisma.animal.findFirst({
    where: {
      id: animalId,
      orgId,
      OR: [
        { researchId: { in: scope.ids } },
        { participations: { some: { researchId: { in: scope.ids } } } },
      ],
    },
    select: { id: true },
  })
  if (!animal) throw new ForbiddenError()
  return scope
}
