// MARES — Triagem da carcaça (interação antrópica e conteúdo gastrointestinal) de um animal.
// PUT, não PATCH: o corpo traz o bloco inteiro e substitui o que havia — ver
// setNecropsyScreeningSchema. Regras (docs/PERMISSOES.md §Animais): ver/editar = qualquer
// membro da org que enxerga o indivíduo, porque a triagem descreve a CARCAÇA, como o laudo.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { setNecropsyScreeningSchema } from "@/schemas/necropsy.schema"
import { interactionsAuditValue, screeningSelect, toScreening } from "@/lib/necropsy"
import { auditStr, diffFields, writeAudit, type FieldChange } from "@/lib/audit"

const FLAGS = [
  "anthropicInteraction",
  "giContentCollected",
  "giSolidWaste",
  "giDetailedScreening",
] as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const body = await req.json().catch(() => null)
    const data = setNecropsyScreeningSchema.parse(body)

    const before = await prisma.animal.findUniqueOrThrow({
      where: { id },
      select: screeningSelect,
    })

    // Uma transação: as quatro respostas e a lista têm de valer juntas — gravar "não há
    // interação" e falhar ao apagar as linhas deixaria o laudo se contradizendo.
    const after = await prisma.$transaction(async (tx) => {
      await tx.animal.update({
        where: { id },
        data: {
          anthropicInteraction: data.anthropicInteraction,
          giContentCollected: data.giContentCollected,
          giSolidWaste: data.giSolidWaste,
          giDetailedScreening: data.giDetailedScreening,
        },
      })
      // Substituição do conjunto: o que não veio no corpo sai. Apagar e recriar (em vez de
      // upsert linha a linha) porque a lista tem no máximo quatro itens e o `createdAt` de
      // uma interação não é dado que alguém consulte.
      await tx.anthropicInteraction.deleteMany({ where: { animalId: id } })
      if (data.interactions.length > 0) {
        await tx.anthropicInteraction.createMany({
          data: data.interactions.map((i) => ({ animalId: id, type: i.type, degree: i.degree })),
        })
      }
      return tx.animal.findUniqueOrThrow({ where: { id }, select: screeningSelect })
    })

    // As quatro respostas são campos do Animal e entram na timeline como tal; a lista entra
    // numa linha só ("FISHERY:2, VESSEL:1"), traduzida na leitura pela aba de auditoria.
    const changes: FieldChange[] = diffFields(before, after, FLAGS)
    const oldList = interactionsAuditValue(before.anthropicInteractions)
    const newList = interactionsAuditValue(after.anthropicInteractions)
    if (auditStr(oldList) !== auditStr(newList)) {
      changes.push({ field: "anthropicInteractions", oldValue: oldList, newValue: newList })
    }
    await writeAudit("Animal", id, user.id, changes)

    return NextResponse.json(toScreening(after))
  } catch (err) {
    return apiError(err)
  }
}
