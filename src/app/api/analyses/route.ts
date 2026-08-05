// MARES — Upsert de uma célula da grade de análises (Fase 3).
// Regras (docs/PERMISSOES.md §Análises): preencher/alterar = qualquer membro da org.
// A combinação (órgão da amostra × patógeno × exame) precisa existir no protocolo da pesquisa.
// Alterações de valor são registradas em AuditLog (rastreabilidade científica).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
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
    // Só preenche análises de amostras de pesquisas que enxerga.
    await assertResearchVisible(user, sample.orgId, sample.researchId)

    // A célula só é válida se o trio (órgão da amostra, patógeno, exame) estiver no protocolo
    // e ATIVO. Combinações inativas preservam o histórico, mas não aceitam novos lançamentos.
    const combo = await prisma.researchProtocol.findFirst({
      where: {
        researchId: sample.researchId,
        organId: sample.organId,
        pathogenId: data.pathogenId,
        examTypeId: data.examTypeId,
        status: "ACTIVE",
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

    const isEmpty = next.result === null && next.measureValue === null && next.notes === null

    // Nada a gravar: célula vazia e sem registro anterior.
    if (!existing && isEmpty) return NextResponse.json(null)

    // Célula esvaziada: apaga a linha em vez de deixá-la com tudo nulo. Uma análise "vazia"
    // não é dado — e, mantida, bloqueava para sempre a exclusão da amostra (sampleHasAnalyses).
    // As confirmações penduradas neste rastreio caem por cascade; o AuditLog registra a saída.
    if (existing && isEmpty) {
      const cleared = (
        [
          ["result", existing.result],
          ["measureValue", existing.measureValue],
          ["notes", existing.notes],
        ] as const
      )
        .filter(([, old]) => old !== null)
        .map(([field, old]) => ({
          field,
          oldValue: str(old),
          newValue: null,
          userId: user.id,
          entity: "Analysis",
          entityId: existing.id,
        }))

      await prisma.analysis.delete({ where: { id: existing.id } })
      if (cleared.length > 0) await prisma.auditLog.createMany({ data: cleared })
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
