// MARES — Admin global: adiciona um membro a QUALQUER grupo de pesquisa.
// Reaproveita provisionMembership (convida usuário novo ou vincula existente) e reativa o
// grupo caso estivesse desativado. Ver docs/PERMISSOES.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { provisionMembership } from "@/lib/members"
import { reactivateOrg } from "@/lib/org-lifecycle"
import { apiError, unauthorized } from "@/lib/api"
import { addMemberSchema } from "@/schemas/organization.schema"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { orgId } = await params
    const body = await req.json().catch(() => null)
    const data = addMemberSchema.parse(body)

    const result = await provisionMembership({
      email: data.email,
      name: data.name,
      orgId,
      role: data.role ?? "RESEARCHER",
    })

    // Grupo que estava desativado volta a ficar ativo ao ganhar um membro.
    await reactivateOrg(orgId)

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
