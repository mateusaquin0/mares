// MARES — Confirmação de espécie por sequenciamento (ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md).
// Um rastreio POSITIVO recebe análises-filhas (parentAnalysisId): a espécie resolvida
// (pathogenId) + o exame de sequenciamento (examTypeId) + registros de sequência (SequenceRecord).
// A confirmação NÃO exige entrada de ResearchProtocol — a validação aqui substitui o gate de
// protocolo do lançamento de rastreio (PUT /api/analyses).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { analysisRowSelect } from "@/lib/analyses"
import type { SequenceRecordData, UpsertConfirmationData } from "@/schemas/analysis.schema"

// Escopo (org/pesquisa) de uma análise, via sample -> animal -> research.
const scopeSelect = {
  id: true,
  sampleId: true,
  parentAnalysisId: true,
  result: true,
  sample: {
    select: { animal: { select: { researchId: true, research: { select: { orgId: true } } } } },
  },
} satisfies Prisma.AnalysisSelect

type AnalysisScope = {
  id: string
  sampleId: string
  orgId: string
  researchId: string
}

/**
 * Carrega o rastreio-pai e valida que ele pode receber confirmações: existe, é um RASTREIO
 * (não é ele mesmo uma confirmação) e está POSITIVO. Retorna o escopo (org/pesquisa) do pai.
 */
export async function loadPositiveParent(parentId: string): Promise<AnalysisScope> {
  const parent = await prisma.analysis.findUnique({ where: { id: parentId }, select: scopeSelect })
  if (!parent || parent.parentAnalysisId !== null) {
    throw new NotFoundError("Análise de rastreio não encontrada", ERROR_CODES.analysisNotFound)
  }
  if (parent.result !== "POSITIVO") {
    throw new ValidationError(
      "Só um rastreio positivo pode receber confirmação de espécie",
      ERROR_CODES.confirmationParentNotPositive,
    )
  }
  return {
    id: parent.id,
    sampleId: parent.sampleId,
    orgId: parent.sample.animal.research.orgId,
    researchId: parent.sample.animal.researchId,
  }
}

/** Carrega uma confirmação (análise-filha) e seu escopo. Falha se não for uma confirmação. */
export async function loadConfirmation(childId: string): Promise<AnalysisScope> {
  const child = await prisma.analysis.findUnique({ where: { id: childId }, select: scopeSelect })
  if (!child || child.parentAnalysisId === null) {
    throw new NotFoundError("Confirmação não encontrada", ERROR_CODES.analysisNotFound)
  }
  return {
    id: child.id,
    sampleId: child.sampleId,
    orgId: child.sample.animal.research.orgId,
    researchId: child.sample.animal.researchId,
  }
}

// Sequências validadas -> linhas de createMany (undefined -> null).
function sequenceRows(analysisId: string, sequences: SequenceRecordData[]) {
  return sequences.map((s) => ({
    analysisId,
    marker: s.marker ?? null,
    accession: s.accession ?? null,
    pctIdentity: s.pctIdentity ?? null,
    consensus: s.consensus ?? null,
    platform: s.platform ?? null,
  }))
}

// Violação da unicidade (sampleId, pathogenId, examTypeId): a espécie+exame já existe na amostra.
function asDuplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictError(
      "Esta espécie já foi confirmada nesta amostra",
      ERROR_CODES.confirmationDuplicate,
    )
  }
  throw err
}

/** Cria uma confirmação (filha) sob um rastreio positivo, com suas sequências, em transação. */
export async function createConfirmation(parent: AnalysisScope, data: UpsertConfirmationData) {
  try {
    return await prisma.$transaction(async (tx) => {
      const child = await tx.analysis.create({
        data: {
          sampleId: parent.sampleId,
          parentAnalysisId: parent.id,
          pathogenId: data.pathogenId,
          examTypeId: data.examTypeId,
          result: data.result ?? "POSITIVO",
          notes: data.notes ?? null,
        },
        select: { id: true },
      })
      if (data.sequences.length > 0) {
        await tx.sequenceRecord.createMany({ data: sequenceRows(child.id, data.sequences) })
      }
      return tx.analysis.findUniqueOrThrow({ where: { id: child.id }, select: analysisRowSelect })
    })
  } catch (err) {
    asDuplicate(err)
  }
}

/** Atualiza uma confirmação (espécie/exame/resultado/notas) e substitui o conjunto de sequências. */
export async function updateConfirmation(childId: string, data: UpsertConfirmationData) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.analysis.update({
        where: { id: childId },
        data: {
          pathogenId: data.pathogenId,
          examTypeId: data.examTypeId,
          result: data.result ?? "POSITIVO",
          notes: data.notes ?? null,
        },
      })
      // Substitui o conjunto inteiro (mais simples que diff; conjunto pequeno).
      await tx.sequenceRecord.deleteMany({ where: { analysisId: childId } })
      if (data.sequences.length > 0) {
        await tx.sequenceRecord.createMany({ data: sequenceRows(childId, data.sequences) })
      }
      return tx.analysis.findUniqueOrThrow({ where: { id: childId }, select: analysisRowSelect })
    })
  } catch (err) {
    asDuplicate(err)
  }
}

/** Remove uma confirmação (as sequências caem por ON DELETE CASCADE). */
export async function deleteConfirmation(childId: string) {
  await prisma.analysis.delete({ where: { id: childId } })
}
