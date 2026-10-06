// MARES — Mídia de um animal: listar e enviar (Fase 3).
// Regras (docs/PERMISSOES.md §Mídia): ver/upload = qualquer membro da org, dentro do escopo
// por pesquisa — o arquivo pertence a UMA das pesquisas do indivíduo (AnimalMedia.researchId),
// como a amostra, e só aparece para quem enxerga essa pesquisa.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible, assertResearchVisible } from "@/lib/research-access"
import { apiError, assertSameOrigin, unauthorized } from "@/lib/api"
import { assertResearchOnAnimal, loadAnimalOrg } from "@/lib/animals"
import {
  MEDIA_BUCKET,
  assertValidContent,
  assertValidFile,
  ensureBucket,
  mediaPath,
  signMediaUrl,
} from "@/lib/media"
import { updateMediaSchema } from "@/schemas/media.schema"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    // Escopo por pesquisa: o indivíduo pode ser visível por uma pesquisa e ter arquivos de
    // outra — só voltam os das pesquisas que o usuário enxerga.
    const scope = await assertAnimalVisible(user, animal.orgId, id)

    const media = await prisma.animalMedia.findMany({
      where: scope.all ? { animalId: id } : { animalId: id, researchId: { in: scope.ids } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        mimeType: true,
        label: true,
        createdAt: true,
        uploadedById: true,
        research: { select: { id: true, name: true } },
      },
    })

    // Substitui o caminho do objeto por uma URL assinada temporária.
    const withUrls = await Promise.all(
      media.map(async (m) => ({ ...m, url: await signMediaUrl(m.url) })),
    )
    return NextResponse.json(withUrls)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Upload multipart não passa por preflight CORS → checagem anti-CSRF por origem.
    assertSameOrigin(req)

    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const formData = await req.formData()
    const file = formData.get("file")
    // Mesma validação da edição (PATCH /api/media/:id): vazio vira null, e o limite vale nas
    // duas portas — sem isso, o upload aceitaria uma legenda que a edição depois recusaria.
    const label = updateMediaSchema.parse({ label: formData.get("label") }).label ?? null
    const researchId = (formData.get("researchId") as string | null)?.trim() || null
    if (!(file instanceof File)) {
      throw new ValidationError("Arquivo ausente", ERROR_CODES.mediaInvalidType)
    }
    assertValidFile({ size: file.size, type: file.type })

    // Pesquisa dona do arquivo: uma das pesquisas do indivíduo, e das que o usuário enxerga.
    // Sem escolha explícita, cai na pesquisa primária — o caso do indivíduo não compartilhado.
    const ownerResearchId = researchId ?? animal.researchId
    await assertResearchOnAnimal(id, ownerResearchId)
    await assertResearchVisible(user, animal.orgId, ownerResearchId)

    await ensureBucket()
    const path = mediaPath(id, file.name)
    const buffer = Buffer.from(await file.arrayBuffer())

    // Valida o conteúdo real pelos magic bytes e usa o tipo DETECTADO (não o do cliente).
    const contentType = assertValidContent(buffer)

    const admin = createAdminClient()
    const { error } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, buffer, { contentType, upsert: false })
    if (error) {
      throw new ValidationError("Falha no upload", ERROR_CODES.mediaUploadFailed)
    }

    const media = await prisma.animalMedia.create({
      data: {
        animalId: id,
        researchId: ownerResearchId,
        url: path,
        mimeType: contentType,
        label,
        uploadedById: user.id,
      },
      select: { id: true },
    })
    return NextResponse.json(media, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
