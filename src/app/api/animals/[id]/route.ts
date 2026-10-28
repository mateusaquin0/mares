// MARES — Detalhe, edição e exclusão de um animal (Fase 3).
// Regras (docs/PERMISSOES.md §Animais):
//  - Ver/editar: qualquer membro da org (RESEARCHER+).
//  - Alterar isPublic: só admin da org.
//  - Excluir: admin da org ou membro da pesquisa primária; o pesquisador não exclui indivíduo
//    compartilhado (409 — a alternativa é ocultá-lo). Bloqueado se houver amostras (409).

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { assertAnimalVisible, getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { updateAnimalSchema } from "@/schemas/animal.schema"
import { animalData, animalDuplicateConflict, loadAnimalOrg } from "@/lib/animals"
import { ACCEPTED_PARTICIPATION } from "@/lib/animal-participation"
import { MEDIA_BUCKET } from "@/lib/media"
import { createAdminClient } from "@/lib/supabase/admin"
import { diffFields, writeAudit } from "@/lib/audit"
import { ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

// Campos do animal auditados na timeline (escalares editáveis pelo usuário).
const ANIMAL_AUDIT_FIELDS = [
  "species",
  "controlId",
  "simbaRecordNumber",
  "taxonFamily",
  "taxonOrder",
  "sex",
  "lifeStage",
  "bodyCondition",
  "decompositionStage",
  "deathCondition",
  "necropsyDate",
  "necropsyWeightKg",
  "strandingLat",
  "strandingLon",
  "strandingBeach",
  "municipality",
  "state",
  "executingInstitution",
  "eventDate",
  "macroscopicNotes",
  "isPublic",
] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")
    const scope = await assertAnimalVisible(user, base.orgId, id)
    // As contagens dos rótulos das abas seguem o MESMO escopo das listas (amostras e mídia são
    // por pesquisa): sem isso, o indivíduo compartilhado mostrava "Mídia (3)" e abria uma lista
    // com um arquivo só — além de revelar o volume de dados da pesquisa vizinha.
    const countScope = scope.all ? {} : { where: { researchId: { in: scope.ids } } }

    const animal = await prisma.animal.findUnique({
      where: { id },
      include: {
        research: { select: { id: true, name: true } },
        // Inclui os convites PENDENTES: quem enxerga o indivíduo acompanha o que já
        // convidou (e pode cancelar). O status distingue participação de convite em aberto.
        participations: {
          select: {
            status: true,
            hiddenAt: true,
            research: { select: { id: true, name: true } },
            invitedBy: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { samples: countScope, media: countScope } },
      },
    })
    return NextResponse.json(animal)
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")
    await assertAnimalVisible(user, base.orgId, id)

    const body = await req.json().catch(() => null)
    const data = updateAnimalSchema.parse(body)

    const isOrgAdmin = orgRole(user, base.orgId) === "ORG_ADMIN"
    if (data.isPublic !== undefined && !isOrgAdmin) {
      throw new ForbiddenError(
        "Apenas administradores alteram a visibilidade",
        ERROR_CODES.forbidden,
      )
    }

    try {
      // Estado anterior (banco) para diferença de auditoria.
      const before = await prisma.animal.findUnique({ where: { id } })
      const animal = await prisma.animal.update({
        where: { id },
        data: {
          ...animalData(data),
          isPublic: isOrgAdmin ? data.isPublic : undefined,
        },
      })
      if (before) {
        await writeAudit("Animal", id, user.id, diffFields(before, animal, ANIMAL_AUDIT_FIELDS))
      }
      return NextResponse.json({ id: animal.id, species: animal.species })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw await animalDuplicateConflict(e, {
          orgId: base.orgId,
          scope: await getResearchScope(user, base.orgId),
          controlId: data.controlId,
          simbaRecordNumber: data.simbaRecordNumber,
        })
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
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")

    const isOrgAdmin = orgRole(user, base.orgId) === "ORG_ADMIN"
    if (!isOrgAdmin) {
      const scope = await getResearchScope(user, base.orgId)
      if (!scope.all && !scope.ids.includes(base.researchId)) {
        throw new ForbiddenError(
          "Só quem integra a pesquisa de origem exclui o indivíduo",
          ERROR_CODES.animalDeleteNotPrimary,
        )
      }
    }

    // Checagens e exclusão na mesma transação, com o indivíduo e as participações travados:
    // amostras e mídias cascateiam com o animal, então uma amostra lançada (ou um
    // compartilhamento aceito) entre a contagem e o DELETE seria apagada sem aviso.
    const mediaPaths = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Animal" WHERE id = ${id} FOR UPDATE`
      await tx.$queryRaw`SELECT "animalId" FROM "AnimalResearch" WHERE "animalId" = ${id} FOR UPDATE`

      if (!isOrgAdmin) {
        // Outra pesquisa também estuda o indivíduo: excluí-lo apagaria o que ela vê dele
        // (identidade, laudo). Convite ainda pendente não conta — a outra pesquisa não vê nada.
        const shared = await tx.animalResearch.count({
          where: { animalId: id, ...ACCEPTED_PARTICIPATION },
        })
        if (shared > 0) {
          throw new ConflictError(
            "O indivíduo é compartilhado com outra pesquisa",
            ERROR_CODES.animalDeleteShared,
          )
        }
      }

      const samples = await tx.sample.count({ where: { animalId: id } })
      if (samples > 0) {
        throw new ConflictError(
          "O animal possui amostras e não pode ser excluído",
          ERROR_CODES.animalHasSamples,
        )
      }

      const media = await tx.animalMedia.findMany({
        where: { animalId: id },
        select: { url: true },
      })
      await tx.animal.delete({ where: { id } })
      return media.map((m) => m.url)
    })

    // Os registros de mídia saem em cascata, mas os arquivos não. Só depois do commit (e
    // best-effort, como na exclusão de um arquivo avulso): falhar aqui deixa um arquivo órfão
    // no bucket, nunca um registro apontando para arquivo apagado.
    if (mediaPaths.length > 0) {
      await createAdminClient().storage.from(MEDIA_BUCKET).remove(mediaPaths)
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
