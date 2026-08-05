// MARES — Editar e excluir uma amostra (Fase 3).
// Regras (docs/PERMISSOES.md §Amostras): editar = qualquer membro; excluir = admin da org,
// quem criou a amostra, ou qualquer membro se a amostra não tem autor conhecido.
// Exclusão bloqueada (409) se houver análises vinculadas (preserva rastreabilidade).

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { updateSampleSchema } from "@/schemas/sample.schema"
import {
  assertOrgan,
  loadSampleOrg,
  sampleData,
  sampleDuplicateError,
  sampleSelect,
} from "@/lib/samples"
import { canDeleteAuthored } from "@/lib/authorship"
import { diffFields, writeAudit } from "@/lib/audit"
import { ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

// Campos escalares da amostra auditados na timeline (órgão/pesquisa ficam de fora).
const SAMPLE_AUDIT_FIELDS = [
  "identification",
  "sampleType",
  "collectionDate",
  "storageLocation",
  "storageTemp",
  "status",
  "notes",
] as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const sample = await loadSampleOrg(id)
    requireOrgRole(user, sample.orgId, "RESEARCHER")
    // Só edita amostra de pesquisa que enxerga.
    await assertResearchVisible(user, sample.orgId, sample.researchId)

    const body = await req.json().catch(() => null)
    const data = updateSampleSchema.parse(body)
    if (data.organId) await assertOrgan(data.organId)

    try {
      const before = await prisma.sample.findUnique({ where: { id }, select: sampleSelect })
      const updated = await prisma.sample.update({
        where: { id },
        data: {
          ...sampleData(data),
          organ: data.organId ? { connect: { id: data.organId } } : undefined,
        },
        select: sampleSelect,
      })
      if (before) {
        await writeAudit("Sample", id, user.id, diffFields(before, updated, SAMPLE_AUDIT_FIELDS))
      }
      return NextResponse.json(updated)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw sampleDuplicateError()
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const sample = await loadSampleOrg(id)
    requireOrgRole(user, sample.orgId, "RESEARCHER")
    // Só exclui amostra de pesquisa que enxerga — indispensável para a regra de órfã abaixo,
    // que de outro modo abriria a amostra sem autor a qualquer pesquisador da organização.
    await assertResearchVisible(user, sample.orgId, sample.researchId)

    // Admin da org, quem cadastrou, ou qualquer membro se a amostra está sem autor.
    const isOrgAdmin = orgRole(user, sample.orgId) === "ORG_ADMIN"
    if (!canDeleteAuthored({ isOrgAdmin, selfId: user.id, authorId: sample.createdById })) {
      throw new ForbiddenError(
        "Você só pode excluir amostras que cadastrou",
        ERROR_CODES.sampleDeleteNotCreator,
      )
    }

    const analyses = await prisma.analysis.count({ where: { sampleId: id } })
    if (analyses > 0) {
      throw new ConflictError(
        "A amostra possui análises e não pode ser excluída",
        ERROR_CODES.sampleHasAnalyses,
      )
    }

    await prisma.sample.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
