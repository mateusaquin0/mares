// MARES — Upsert de uma célula da grade de análises (Fase 3).
// Regras (docs/PERMISSOES.md §Análises): preencher/alterar = qualquer membro da org.
// A combinação (órgão da amostra × patógeno × exame) precisa existir no protocolo da pesquisa.
// Alterações de valor são registradas em AuditLog (rastreabilidade científica).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { upsertAnalysisSchema } from "@/schemas/analysis.schema"
import { loadSampleOrg } from "@/lib/samples"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

const str = (v: unknown) => (v == null ? null : String(v))

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await req.json().catch(() => null)
    const data = upsertAnalysisSchema.parse(body)

    const sample = await loadSampleOrg(data.sampleId)
    requireOrgRole(user, sample.orgId, "RESEARCHER")

    // A célula só é válida se o trio (órgão da amostra, patógeno, exame) estiver no protocolo.
    const combo = await prisma.researchProtocol.findFirst({
      where: {
        researchId: sample.researchId,
        organId: sample.organId,
        pathogenId: data.pathogenId,
        examTypeId: data.examTypeId,
      },
      select: { id: true },
    })
    if (!combo) {
      throw new ValidationError("Combinação fora do protocolo", ERROR_CODES.analysisInvalidCombo)
    }

    const key = {
      sampleId: data.sampleId,
      pathogenId: data.pathogenId,
      examTypeId: data.examTypeId,
    }
    const next = {
      result: data.result ?? null,
      measureValue: data.measureValue ?? null,
      notes: data.notes ?? null,
    }

    const existing = await prisma.analysis.findUnique({
      where: { sampleId_pathogenId_examTypeId: key },
      select: { id: true, result: true, measureValue: true, notes: true },
    })

    // Nada a gravar: célula vazia e sem registro anterior.
    if (!existing && next.result === null && next.measureValue === null && next.notes === null) {
      return NextResponse.json(null)
    }

    const saved = await prisma.analysis.upsert({
      where: { sampleId_pathogenId_examTypeId: key },
      create: { ...key, ...next },
      update: next,
      select: { id: true, result: true, measureValue: true, notes: true },
    })

    // Registra em AuditLog apenas os campos que mudaram.
    const changed: { field: string; oldValue: string | null; newValue: string | null }[] = (
      [
        ["result", existing?.result ?? null, next.result],
        ["measureValue", existing?.measureValue ?? null, next.measureValue],
        ["notes", existing?.notes ?? null, next.notes],
      ] as const
    )
      .filter(([, o, n]) => str(o) !== str(n))
      .map(([field, o, n]) => ({ field, oldValue: str(o), newValue: str(n) }))

    if (changed.length > 0) {
      await prisma.auditLog.createMany({
        data: changed.map((c) => ({
          ...c,
          userId: user.id,
          entity: "Analysis",
          entityId: saved.id,
        })),
      })
    }

    return NextResponse.json(saved)
  } catch (err) {
    return apiError(err)
  }
}
