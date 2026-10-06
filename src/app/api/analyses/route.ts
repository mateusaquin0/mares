// MARES — Upsert de uma célula da grade de análises (Fase 3).
// Regras (docs/PERMISSOES.md §Análises): preencher/alterar = qualquer membro da org.
// A combinação (órgão da amostra × patógeno × exame) precisa existir no protocolo da pesquisa.
// Alterações de valor são registradas em AuditLog (rastreabilidade científica).
//
// O corpo é um PATCH: só os campos que o usuário editou chegam aqui (ausente = não altera,
// null = limpa). O estado final sai de applyAnalysisPatch sobre a linha que já existe, e não
// do que o cliente acha que está gravado.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { upsertAnalysisSchema } from "@/schemas/analysis.schema"
import { loadSampleOrg } from "@/lib/samples"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import {
  analysisChanges,
  applyAnalysisPatch,
  isAnalysisEmpty,
  type AnalysisPatch,
  type AnalysisValues,
} from "@/lib/analyses"

const cellSelect = {
  id: true,
  result: true,
  measureValue: true,
  notes: true,
} satisfies Prisma.AnalysisSelect

type CellKey = { sampleId: string; pathogenId: string; examTypeId: string }

// Cria o rastreio. Se outra requisição criou a MESMA célula no meio do caminho (P2002 no
// índice único parcial dos rastreios), atualiza a linha que ganhou a corrida em vez de falhar.
async function createScreening(key: CellKey, next: AnalysisValues) {
  try {
    return await prisma.analysis.create({ data: { ...key, ...next }, select: cellSelect })
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err
    const won = await prisma.analysis.findFirst({
      where: { ...key, parentAnalysisId: null },
      select: { id: true },
    })
    if (!won) throw err
    return prisma.analysis.update({ where: { id: won.id }, data: next, select: cellSelect })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await req.json().catch(() => null)
    const { sampleId, pathogenId, examTypeId, ...rest } = upsertAnalysisSchema.parse(body)
    const patch: AnalysisPatch = rest

    const sample = await loadSampleOrg(sampleId)
    requireOrgRole(user, sample.orgId, "RESEARCHER")
    // Só preenche análises de amostras de pesquisas que enxerga.
    await assertResearchVisible(user, sample.orgId, sample.researchId)

    // A célula só é válida se o trio (órgão da amostra, patógeno, exame) estiver no protocolo
    // e ATIVO. Combinações inativas preservam o histórico, mas não aceitam novos lançamentos.
    const combo = await prisma.researchProtocol.findFirst({
      where: {
        researchId: sample.researchId,
        organId: sample.organId,
        pathogenId,
        examTypeId,
        status: "ACTIVE",
      },
      select: { id: true },
    })
    if (!combo) {
      throw new ValidationError("Combinação fora do protocolo", ERROR_CODES.analysisInvalidCombo)
    }

    const key: CellKey = { sampleId, pathogenId, examTypeId }

    // A célula da grade é o RASTREIO (parentAnalysisId null). As confirmações de espécie vivem
    // na mesma amostra e podem repetir o par (patógeno, exame): sem este filtro o lançamento
    // caía na linha da confirmação — que a grade nem exibe, de onde a mudança "sumia".
    const existing = await prisma.analysis.findFirst({
      where: { ...key, parentAnalysisId: null },
      select: cellSelect,
    })

    const next = applyAnalysisPatch(existing, patch)
    const changes = analysisChanges(existing, next)

    const audit = (entityId: string) =>
      prisma.auditLog.createMany({
        data: changes.map((c) => ({ ...c, userId: user.id, entity: "Analysis", entityId })),
      })

    // Célula esvaziada: apaga a linha em vez de deixá-la com tudo nulo (ver isAnalysisEmpty).
    // As confirmações penduradas neste rastreio caem por cascade; o AuditLog registra a saída.
    // O cliente só chega aqui depois de confirmar com o usuário.
    if (isAnalysisEmpty(next)) {
      if (!existing) return NextResponse.json({ status: "unchanged", analysis: null })
      await prisma.analysis.delete({ where: { id: existing.id } })
      if (changes.length > 0) await audit(existing.id)
      return NextResponse.json({ status: "cleared", analysis: null })
    }

    // Nada mudou: não grava nada e avisa o cliente, que então NÃO anuncia "resultado salvo".
    if (existing && changes.length === 0) {
      return NextResponse.json({ status: "unchanged", analysis: existing })
    }

    const saved = existing
      ? await prisma.analysis.update({ where: { id: existing.id }, data: next, select: cellSelect })
      : await createScreening(key, next)

    // Registra em AuditLog apenas os campos que mudaram.
    if (changes.length > 0) await audit(saved.id)

    return NextResponse.json({ status: "saved", analysis: saved })
  } catch (err) {
    return apiError(err)
  }
}
