// MARES — Excluir um arquivo de mídia (Fase 3).
// Regras (docs/PERMISSOES.md §Mídia): excluir = só admin da org.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { loadMediaOrg, MEDIA_BUCKET } from "@/lib/media"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const media = await loadMediaOrg(id)
    requireOrgRole(user, media.orgId, "ORG_ADMIN")

    // Remove do storage (best-effort) e depois do banco.
    const admin = createAdminClient()
    await admin.storage.from(MEDIA_BUCKET).remove([media.path])
    await prisma.animalMedia.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
