// MARES — Mídia de um animal: listar e enviar (Fase 3).
// Regras (docs/PERMISSOES.md §Mídia): ver/upload = qualquer membro da org.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import {
  MEDIA_BUCKET,
  assertValidFile,
  ensureBucket,
  mediaPath,
  signMediaUrl,
} from "@/lib/media"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const media = await prisma.animalMedia.findMany({
      where: { animalId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, mimeType: true, label: true, createdAt: true },
    })

    // Substitui o caminho do objeto por uma URL assinada temporária.
    const withUrls = await Promise.all(
      media.map(async (m) => ({ ...m, url: await signMediaUrl(m.url) }))
    )
    return NextResponse.json(withUrls)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const formData = await req.formData()
    const file = formData.get("file")
    const label = (formData.get("label") as string | null)?.trim() || null
    if (!(file instanceof File)) {
      throw new ValidationError("Arquivo ausente", ERROR_CODES.mediaInvalidType)
    }
    assertValidFile({ size: file.size, type: file.type })

    await ensureBucket()
    const path = mediaPath(id, file.name)
    const buffer = Buffer.from(await file.arrayBuffer())

    const admin = createAdminClient()
    const { error } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (error) {
      throw new ValidationError("Falha no upload", ERROR_CODES.mediaUploadFailed)
    }

    const media = await prisma.animalMedia.create({
      data: { animalId: id, url: path, mimeType: file.type, label },
      select: { id: true },
    })
    return NextResponse.json(media, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
