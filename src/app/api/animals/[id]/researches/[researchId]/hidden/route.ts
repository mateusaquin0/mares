// MARES — Ocultar / reexibir um indivíduo numa pesquisa.
//
//   PUT    → oculta: sai da listagem, do mapa e do dashboard da pesquisa (dados preservados).
//   DELETE → reexibe.
//
// Vale para a pesquisa primária e para as participações aceitas. Quem decide é quem integra
// a pesquisa (ou o admin da org): ocultar é uma escolha da própria pesquisa, que não afeta as
// demais. Regras em setAnimalHidden; ver docs/PERMISSOES.md §Animais.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg, setAnimalHidden } from "@/lib/animals"

type Ctx = { params: Promise<{ id: string; researchId: string }> }

async function handle(params: Ctx["params"], hidden: boolean) {
  const user = await getAuthUser()
  if (!user) return unauthorized()
  const { id, researchId } = await params
  const base = await loadAnimalOrg(id)
  requireOrgRole(user, base.orgId, "RESEARCHER")
  await assertResearchVisible(user, base.orgId, researchId)

  await setAnimalHidden(id, researchId, hidden)
  return new NextResponse(null, { status: 204 })
}

export async function PUT(_req: NextRequest, { params }: Ctx) {
  try {
    return await handle(params, true)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    return await handle(params, false)
  } catch (err) {
    return apiError(err)
  }
}
