// MARES — Excluir um arquivo de mídia (Fase 3).
// Regras (docs/PERMISSOES.md §Mídia): excluir = admin da org, ou quem enviou o arquivo.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { loadMediaOrg, MEDIA_BUCKET } from "@/lib/media"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const media = await loadMediaOrg(id)
    requireOrgRole(user, media.orgId, "RESEARCHER")

    // Arquivos anteriores à coluna `uploadedById` têm autor nulo: seguem só com o admin.
    const isOrgAdmin = orgRole(user, media.orgId) === "ORG_ADMIN"
    if (!isOrgAdmin && media.uploadedById !== user.id) {
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
