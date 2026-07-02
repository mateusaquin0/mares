// MARES — Helpers de acesso a animais (Fase 3).
// Um animal pertence a uma pesquisa, que pertence a uma organização. O acesso é validado
// pelo Membership do usuário naquela organização (ver docs/PERMISSOES.md §Animais).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

/**
 * Traduz a violação de unicidade (P2002) do animal no erro mais específico possível,
 * indicando QUAL identificador está duplicado (ID de controle ou Nº SIMBA).
 */
export function animalDuplicateError(e: Prisma.PrismaClientKnownRequestError): ConflictError {
  const target = Array.isArray(e.meta?.target)
    ? e.meta.target.join(",")
    : String(e.meta?.target ?? "")
  if (/simba/i.test(target)) {
    return new ConflictError("Nº SIMBA já cadastrado", ERROR_CODES.animalSimbaDuplicate)
  }
  if (/control/i.test(target)) {
    return new ConflictError("ID de controle já cadastrado", ERROR_CODES.animalControlDuplicate)
  }
  return new ConflictError("ID já cadastrado", ERROR_CODES.animalDuplicate)
}

/** Carrega o animal com o orgId da pesquisa (para checagem de papel). */
export async function loadAnimalOrg(id: string) {
  const animal = await prisma.animal.findUnique({
    where: { id },
    select: { id: true, isPublic: true, researchId: true, research: { select: { orgId: true } } },
  })
  if (!animal) throw new NotFoundError("Animal não encontrado", ERROR_CODES.animalNotFound)
  return { id: animal.id, isPublic: animal.isPublic, researchId: animal.researchId, orgId: animal.research.orgId }
}

/** Confere que a pesquisa existe e pertence à organização informada. */
export async function assertResearchInOrg(researchId: string, orgId: string) {
  const research = await prisma.research.findUnique({
    where: { id: researchId },
    select: { orgId: true },
  })
  if (!research || research.orgId !== orgId) {
    throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
  }
}

// Campos comuns editáveis do animal (exceto researchId e isPublic, tratados à parte).
// Semântica: undefined = não altera; null = limpa (NULL); valor = grava.
type Nullable<T> = T | null | undefined
export type AnimalWritable = {
  species?: string
  wormsAphiaId?: Nullable<number>
  taxonFamily?: Nullable<string>
  taxonOrder?: Nullable<string>
  controlId?: Nullable<string>
  simbaRecordNumber?: Nullable<string>
  sex?: Nullable<string>
  lifeStage?: Nullable<string>
  bodyCondition?: Nullable<string>
  decompositionStage?: Nullable<string>
  strandingLat?: Nullable<number>
  strandingLon?: Nullable<number>
  strandingBeach?: Nullable<string>
  municipality?: Nullable<string>
  state?: Nullable<string>
  eventDate?: Nullable<string>
  macroscopicNotes?: Nullable<string>
}

/** Monta o objeto de dados do Prisma a partir dos campos validados. */
export function animalData(input: AnimalWritable) {
  return {
    species: input.species?.trim(),
    wormsAphiaId: input.wormsAphiaId,
    taxonFamily: input.taxonFamily,
    taxonOrder: input.taxonOrder,
    controlId: input.controlId,
    simbaRecordNumber: input.simbaRecordNumber,
    sex: input.sex,
    lifeStage: input.lifeStage,
    bodyCondition: input.bodyCondition,
    decompositionStage: input.decompositionStage,
    strandingLat: input.strandingLat,
    strandingLon: input.strandingLon,
    strandingBeach: input.strandingBeach,
    municipality: input.municipality,
    state: input.state,
    eventDate:
      input.eventDate === undefined ? undefined : input.eventDate === null ? null : new Date(input.eventDate),
    macroscopicNotes: input.macroscopicNotes,
  }
}

// Campos retornados na listagem.
export const animalListSelect = {
  id: true,
  controlId: true,
  simbaRecordNumber: true,
  species: true,
  sex: true,
  lifeStage: true,
  municipality: true,
  state: true,
  eventDate: true,
  isPublic: true,
  research: { select: { id: true, name: true } },
  _count: { select: { samples: true } },
} as const
