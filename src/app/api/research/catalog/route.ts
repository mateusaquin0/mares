// MARES — Catálogo de pesquisas da organização ativa.
//
// Diferente de GET /api/research (que devolve só as pesquisas do ESCOPO do usuário e alimenta
// os seletores onde ele vai gravar dados), o catálogo lista TODAS as pesquisas do grupo — é a
// vitrine que permite ao pesquisador saber o que existe e pedir acesso, e é o que preenche o
// seletor de destino ao compartilhar um indivíduo.
//
// O que se expõe de uma pesquisa que o usuário NÃO integra é deliberadamente pouco: nome,
// descrição, visibilidade e autor. Nada de contagens (volume de dados) nem de conteúdo — os
// DADOS continuam restritos aos membros. Ver docs/PERMISSOES.md §Escopo por pesquisa.

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { myAccessRequestStatus } from "@/lib/research-requests"
import { apiError, unauthorized } from "@/lib/api"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json([])
    requireOrgRole(user, orgId, "RESEARCHER")

    const [scope, requests, links, researches] = await Promise.all([
      getResearchScope(user, orgId),
      myAccessRequestStatus(orgId, user.id),
      // Vínculos REAIS do usuário (ResearchMember). Não dá para derivar do escopo: o admin
      // da org enxerga todas as pesquisas sem ser membro de nenhuma, e é o vínculo — não a
      // visibilidade — que decide se existe algo de que sair.
      prisma.researchMember.findMany({
        where: { userId: user.id, research: { orgId } },
        select: { researchId: true },
      }),
      prisma.research.findMany({
        where: { orgId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          isPublic: true,
          createdById: true,
          createdBy: { select: { name: true, email: true } },
          _count: { select: { animals: true, protocols: true } },
        },
      }),
    ])

    const memberOf = new Set(links.map((l) => l.researchId))
    const items = researches.map(({ _count, ...r }) => {
      // `isMember` = vínculo real (governa "sair" e o selo "participa").
      // `canSeeData` = enxerga os dados, seja por vínculo ou por ser admin da org.
      const canSeeData = scope.all || scope.ids.includes(r.id)
      return {
        ...r,
        isMember: memberOf.has(r.id),
        canSeeData,
        // Contagens só para quem já tem acesso aos dados.
        _count: canSeeData ? _count : null,
        // Estado do PRÓPRIO pedido (o botão vira "aguardando resposta" / "recusado").
        requestStatus: requests.get(r.id) ?? null,
      }
    })

    return NextResponse.json(items)
  } catch (err) {
    return apiError(err)
  }
}
