// MARES — Helpers de acesso a animais (Fase 3).
// Um animal pertence a uma pesquisa, que pertence a uma organização. O acesso é validado
// pelo Membership do usuário naquela organização (ver docs/PERMISSOES.md §Animais).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { pathogenName, type I18nText } from "@/lib/catalog-i18n"

/**
 * Traduz a violação de unicidade (P2002) do animal no erro mais específico possível,
 * indicando QUAL identificador está duplicado (ID de controle ou Nº SIMBA).
 */
export function animalDuplicateError(e: Prisma.PrismaClientKnownRequestError): ConflictError {
  const target = Array.isArray(e.meta?.target)
    ? e.meta.target.join(",")
    : String(e.meta?.target ?? "")
  if (/simba/i.test(target)) {
    return new ConflictError("Identificador SIMBA já cadastrado", ERROR_CODES.animalSimbaDuplicate)
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
  return {
    id: animal.id,
    isPublic: animal.isPublic,
    researchId: animal.researchId,
    orgId: animal.research.orgId,
  }
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
  deathCondition?: Nullable<string>
  necropsyDate?: Nullable<string>
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
    deathCondition: input.deathCondition,
    strandingLat: input.strandingLat,
    strandingLon: input.strandingLon,
    strandingBeach: input.strandingBeach,
    municipality: input.municipality,
    state: input.state,
    eventDate:
      input.eventDate === undefined
        ? undefined
        : input.eventDate === null
          ? null
          : new Date(input.eventDate),
    necropsyDate:
      input.necropsyDate === undefined
        ? undefined
        : input.necropsyDate === null
          ? null
          : new Date(input.necropsyDate),
    macroscopicNotes: input.macroscopicNotes,
  }
}

// Campos retornados na listagem. Inclui as análises POSITIVAS (where embutido) para derivar
// os patógenos positivos por animal — usado no filtro por patógeno da tabela — sem trazer a
// grade inteira. `_count.samples` mantém a contagem exibida.
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
  // isPublic da pesquisa: a visibilidade pública EFETIVA do animal é animal.isPublic E
  // research.isPublic (ver publicMapPoints / docs/PERMISSOES.md).
  research: { select: { id: true, name: true, isPublic: true } },
  // Pesquisas adicionais que compartilham o indivíduo (para exibição e filtro por pesquisa).
  participations: { select: { research: { select: { id: true, name: true } } } },
  _count: { select: { samples: true } },
  samples: {
    select: {
      analyses: {
        where: { result: "POSITIVO" as const },
        select: { pathogen: { select: { scientificName: true, name: true } } },
      },
    },
  },
} as const

type RawListAnimal = Prisma.AnimalGetPayload<{ select: typeof animalListSelect }>

// Serializa um animal da listagem: resolve os patógenos positivos (por locale) e remove a
// árvore de samples/analyses do payload enviado ao cliente.
export function toAnimalListItem(locale: string, a: RawListAnimal) {
  const { samples, participations, ...rest } = a
  const names = new Set<string>()
  for (const s of samples) {
    for (const an of s.analyses) {
      const label = pathogenName(locale, {
        scientificName: an.pathogen.scientificName,
        name: an.pathogen.name as I18nText | null,
      })
      if (label) names.add(label)
    }
  }
  return {
    ...rest,
    // Conjunto efetivo de pesquisas do indivíduo = primária + participações. Usado no
    // filtro por pesquisa da listagem (ciente do compartilhamento).
    researches: [rest.research, ...participations.map((p) => p.research)],
    positivePathogens: [...names].sort((x, y) => x.localeCompare(y, locale)),
  }
}

// ── Compartilhamento de indivíduo entre pesquisas (participações) ──────────────

/** Adiciona uma pesquisa (da mesma org) como participante do indivíduo. */
export async function addAnimalResearch(animalId: string, orgId: string, researchId: string) {
  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: { researchId: true },
  })
  if (!animal) throw new NotFoundError("Animal não encontrado", ERROR_CODES.animalNotFound)
  if (animal.researchId === researchId) {
    throw new ConflictError(
      "Esta já é a pesquisa primária do indivíduo",
      ERROR_CODES.animalResearchPrimary,
    )
  }
  // Garante que a pesquisa existe e pertence à mesma organização do indivíduo.
  await assertResearchInOrg(researchId, orgId)
  try {
    await prisma.animalResearch.create({ data: { animalId, researchId } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ConflictError(
        "Esta pesquisa já compartilha o indivíduo",
        ERROR_CODES.animalResearchExists,
      )
    }
    throw e
  }
}

/**
 * Garante que `researchId` é uma das pesquisas do indivíduo (primária OU participante).
 * Usado ao atribuir a pesquisa dona de uma amostra (grade por pesquisa — Etapa 2).
 */
export async function assertResearchOnAnimal(animalId: string, researchId: string) {
  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: {
      researchId: true,
      participations: { where: { researchId }, select: { researchId: true } },
    },
  })
  if (!animal) throw new NotFoundError("Animal não encontrado", ERROR_CODES.animalNotFound)
  if (animal.researchId === researchId || animal.participations.length > 0) return
  throw new ValidationError(
    "Pesquisa não vinculada a este indivíduo",
    ERROR_CODES.animalResearchNotLinked,
  )
}

/** Remove a participação de uma pesquisa no indivíduo (idempotente). */
export async function removeAnimalResearch(animalId: string, researchId: string) {
  // Bloqueia se a pesquisa tem amostras neste indivíduo (perderiam a dona). O usuário deve
  // remover/reatribuir as amostras antes de desvincular a pesquisa.
  const samples = await prisma.sample.count({ where: { animalId, researchId } })
  if (samples > 0) {
    throw new ConflictError(
      "A pesquisa possui amostras neste indivíduo",
      ERROR_CODES.animalResearchHasData,
    )
  }
  try {
    await prisma.animalResearch.delete({
      where: { animalId_researchId: { animalId, researchId } },
    })
  } catch (e) {
    // P2025 = registro inexistente: trata como sucesso (idempotente).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return
    throw e
  }
}
