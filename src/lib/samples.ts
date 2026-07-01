// MARES — Helpers de acesso a amostras (Fase 3).
// Amostra -> Animal -> Research -> Organization. Acesso validado pelo Membership.

import { prisma } from "@/lib/prisma"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

/** Carrega a amostra com orgId/organId/researchId (via animal -> pesquisa) para checagens. */
export async function loadSampleOrg(id: string) {
  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      id: true,
      animalId: true,
      organId: true,
      animal: { select: { researchId: true, research: { select: { orgId: true } } } },
    },
  })
  if (!sample) throw new NotFoundError("Amostra não encontrada", ERROR_CODES.sampleNotFound)
  return {
    id: sample.id,
    animalId: sample.animalId,
    organId: sample.organId,
    researchId: sample.animal.researchId,
    orgId: sample.animal.research.orgId,
  }
}

/** Confere que o órgão (catálogo) existe. */
export async function assertOrgan(organId: string) {
  const organ = await prisma.organ.findUnique({ where: { id: organId }, select: { id: true } })
  if (!organ) throw new NotFoundError("Órgão não encontrado", ERROR_CODES.organNotFound)
}

type Nullable<T> = T | null | undefined

/** Monta os dados do Prisma a partir dos campos validados da amostra. */
export function sampleData(input: {
  sampleType?: string
  collectionDate?: Nullable<string>
  storageLocation?: Nullable<string>
  storageTemp?: Nullable<number>
  status?: string
  notes?: Nullable<string>
}) {
  return {
    sampleType: input.sampleType?.trim(),
    collectionDate:
      input.collectionDate === undefined
        ? undefined
        : input.collectionDate === null
          ? null
          : new Date(input.collectionDate),
    storageLocation: input.storageLocation,
    storageTemp: input.storageTemp,
    status: input.status as "STORED" | "IN_USE" | "DEPLETED" | "DEGRADED" | undefined,
    notes: input.notes,
  }
}

export const sampleSelect = {
  id: true,
  sampleType: true,
  collectionDate: true,
  storageLocation: true,
  storageTemp: true,
  status: true,
  notes: true,
  createdAt: true,
  organ: { select: { id: true, name: true } },
  _count: { select: { analyses: true } },
} as const
