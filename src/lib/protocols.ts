// MARES — Ciclo de vida de protocolos de pesquisa (ver docs/PLANO_PROTOCOLO_ANALISES.md).
// A lógica transacional vive aqui para ser reutilizada pela rota e pelos testes de integração.

import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Aceita o client global ou o transacional ($transaction) — as funções abaixo já rodam dentro
// da própria transação quando recebem o `tx`.
type Db = PrismaClient | Prisma.TransactionClient

type ProtocolCombo = {
  researchId: string
  organId: string
  pathogenId: string
  examTypeId: string
}

/**
 * Exclusão destrutiva de uma entrada de protocolo: apaga retroativamente as análises da
 * combinação exata (amostras da pesquisa+órgão, mesmo patógeno e exame) e remove a entrada.
 * Roda em transação para não deixar protocolo apagado com análises remanescentes nem o inverso.
 */
export async function deleteProtocolCascade(protocolId: string, entry: ProtocolCombo) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.analysis.deleteMany({
      where: {
        pathogenId: entry.pathogenId,
        examTypeId: entry.examTypeId,
        sample: { researchId: entry.researchId, organId: entry.organId },
      },
    })
    await tx.researchProtocol.delete({ where: { id: protocolId } })
    return { deletedAnalyses: count }
  })
}

/**
 * Adiciona um lote de combinações à pesquisa. Combinações inéditas são criadas ACTIVE;
 * combinações já existentes e INACTIVE são reativadas (status ACTIVE, deactivatedAt nulo);
 * combinações já ACTIVE são mantidas. Retorna quantas foram criadas ou reativadas.
 */
export async function addOrReactivateProtocols(
  researchId: string,
  entries: Pick<ProtocolCombo, "organId" | "pathogenId" | "examTypeId">[],
) {
  return prisma.$transaction(async (tx) => {
    let affected = 0
    for (const e of entries) {
      const existing = await tx.researchProtocol.findUnique({
        where: {
          researchId_organId_pathogenId_examTypeId: {
            researchId,
            organId: e.organId,
            pathogenId: e.pathogenId,
            examTypeId: e.examTypeId,
          },
        },
        select: { id: true, status: true },
      })

      if (!existing) {
        await tx.researchProtocol.create({ data: { ...e, researchId } })
        affected++
      } else if (existing.status === "INACTIVE") {
        await tx.researchProtocol.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", deactivatedAt: null },
        })
        affected++
      }
    }
    return { affected }
  })
}

/** Ativa ou desativa uma entrada. Nunca remove análises: só muda o estado do protocolo. */
export async function setProtocolStatus(
  protocolId: string,
  status: "ACTIVE" | "INACTIVE",
  db: Db = prisma,
) {
  return db.researchProtocol.update({
    where: { id: protocolId },
    data: { status, deactivatedAt: status === "INACTIVE" ? new Date() : null },
  })
}
