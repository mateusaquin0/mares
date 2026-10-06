// MARES — Editar a legenda e excluir um arquivo de mídia (Fase 3).
// Regras (docs/PERMISSOES.md §Mídia): editar legenda = qualquer membro da pesquisa dona (é
// correção de metadado, como editar amostra); excluir = admin da org, quem enviou o arquivo,
// ou qualquer membro da pesquisa dona se o arquivo não tem autor conhecido.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { canDeleteAuthored } from "@/lib/authorship"
import { apiError, unauthorized } from "@/lib/api"
import { updateMediaSchema } from "@/schemas/media.schema"
import { ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { loadMediaOrg, MEDIA_BUCKET } from "@/lib/media"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const media = await loadMediaOrg(id)
    requireOrgRole(user, media.orgId, "RESEARCHER")
    await assertResearchVisible(user, media.orgId, media.researchId)

    const body = await req.json().catch(() => null)
    const data = updateMediaSchema.parse(body)

    const updated = await prisma.animalMedia.update({
      where: { id },
      data: { label: data.label },
      select: { id: true, label: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const media = await loadMediaOrg(id)
    requireOrgRole(user, media.orgId, "RESEARCHER")
    // Só exclui arquivo de pesquisa que enxerga — indispensável para a regra de órfão abaixo,
    // que de outro modo abriria o arquivo sem autor a qualquer pesquisador da organização.
    await assertResearchVisible(user, media.orgId, media.researchId)

    // Admin da org, quem enviou, ou qualquer membro se o arquivo está sem autor.
    const isOrgAdmin = orgRole(user, media.orgId) === "ORG_ADMIN"
    if (!canDeleteAuthored({ isOrgAdmin, selfId: user.id, authorId: media.uploadedById })) {
      throw new ForbiddenError(
        "Você só pode excluir arquivos que enviou",
        ERROR_CODES.mediaDeleteNotUploader,
      )
    }

    // Remove do storage (best-effort) e depois do banco.
    const admin = createAdminClient()
    await admin.storage.from(MEDIA_BUCKET).remove([media.path])
    await prisma.animalMedia.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
