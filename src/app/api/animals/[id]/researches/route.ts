// MARES — Compartilhamento de um indivíduo entre pesquisas do mesmo grupo.
//
// Um único POST cobre os dois sentidos, e a DIREÇÃO é inferida do escopo de quem chama —
// não é o cliente que a escolhe (ver docs/PERMISSOES.md §Compartilhamento de indivíduo):
//
//   • Enxerga o indivíduo  → CONVITE (INVITE) para a pesquisa de destino, que decide.
//   • Não enxerga, mas é membro da pesquisa de destino → PEDIDO (REQUEST) à pesquisa
//     primária do indivíduo, que decide. É o caminho de quem descobriu o indivíduo pelo
//     conflito de identificador (SIMBA/ID de controle já cadastrado em outra pesquisa).
//   • Nenhum dos dois → 403.
//
// Quando quem age já enxerga OS DOIS lados (membro das duas pesquisas ou admin da org), o
// vínculo já nasce aceito: não há um segundo lado de quem pedir consentimento.
//
// Autorização: membro da org (RESEARCHER+).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { getResearchScope, isAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { createAnimalShare, loadAnimalOrg } from "@/lib/animals"
import { shareAnimalSchema } from "@/schemas/animal.schema"
import { ForbiddenError } from "@/lib/errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const { researchId, message } = shareAnimalSchema.parse(body)

    const scope = await getResearchScope(user, animal.orgId)
    const seesAnimal = await isAnimalVisible(user, animal.orgId, id)
    const seesTarget = scope.all || scope.ids.includes(researchId)

    // Sem nenhum dos dois lados no escopo, a pessoa não tem o que compartilhar nem para onde.
    if (!seesAnimal && !seesTarget) throw new ForbiddenError()

    const status = await createAnimalShare(id, animal.orgId, researchId, {
      origin: seesAnimal ? "INVITE" : "REQUEST",
      invitedById: user.id,
      autoAccept: seesAnimal && seesTarget,
      message: seesAnimal ? null : message,
    })

    return NextResponse.json({ status }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
