// MARES — Helpers do laudo anatomopatológico (macro) e histopatológico (micro).
//
// O laudo pende do ANIMAL, não da pesquisa: descreve a carcaça, como `bodyCondition` e
// `necropsyDate`. Por isso não há escopo por pesquisa aqui — o guard é `assertAnimalVisible`,
// e num indivíduo compartilhado as duas pesquisas veem e editam o mesmo laudo.
// Ver docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.

import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import type { AnthropicInteractionValue } from "@/lib/necropsy-enums"
import type { NecropsyScreening } from "@/types/necropsy"

export const grossFindingSelect = {
  id: true,
  tissue: true,
  site: true,
  organ: { select: { id: true, name: true } },
  lesion: true,
  distribution: true,
  severity: true,
  notes: true,
  parasitesPresent: true,
  parasitesCollected: true,
  parasiteCount: true,
  position: true,
} as const

export const systemExamSelect = {
  id: true,
  status: true,
  notExaminedReason: true,
  position: true,
  system: { select: { id: true, name: true } },
  findings: { select: grossFindingSelect, orderBy: { position: "asc" } },
} as const

// Triagem da carcaça: as quatro perguntas ficam no Animal, as interações em tabela própria
// (a triagem aceita mais de uma). Os dois vêm juntos na leitura do laudo.
export const screeningSelect = {
  anthropicInteraction: true,
  giContentCollected: true,
  giSolidWaste: true,
  giDetailedScreening: true,
  anthropicInteractions: { select: { type: true, degree: true }, orderBy: { type: "asc" } },
} as const

// Linha do banco no formato da tela: a relação se chama `anthropicInteractions` (é o plural
// do tipo), mas dentro da triagem ela é só "as interações".
export type ScreeningRow = {
  anthropicInteraction: boolean | null
  giContentCollected: boolean | null
  giSolidWaste: boolean | null
  giDetailedScreening: boolean | null
  anthropicInteractions: { type: AnthropicInteractionValue; degree: number }[]
}

export function toScreening(row: ScreeningRow): NecropsyScreening {
  const { anthropicInteractions, ...flags } = row
  return { ...flags, interactions: anthropicInteractions }
}

/**
 * Interações no formato do log de auditoria: "FISHERY:2, VESSEL:1".
 *
 * Uma linha só, e com os valores CANÔNICOS: o log guarda strings e é lido em pt ou en, então
 * a tradução tem de acontecer na leitura (audit-tab), não aqui.
 */
export function interactionsAuditValue(
  interactions: readonly { type: string; degree: number }[],
): string | null {
  if (interactions.length === 0) return null
  return [...interactions]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((i) => `${i.type}:${i.degree}`)
    .join(", ")
}

export const histopathologySelect = {
  id: true,
  finding: true,
  position: true,
  organ: { select: { id: true, name: true } },
} as const

/**
 * Trecho de `select` que injeta o laudo nas exportações (planilha de animais e de pesquisa).
 *
 * Sem escopo por pesquisa, de propósito: o laudo é do INDIVÍDUO, então quem enxerga o animal
 * enxerga o laudo inteiro — diferente de amostras e análises, que as rotas filtram por
 * `researchId`. Ver §Decisão estruturante em docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.
 */
export const necropsyExportSelect = {
  ...screeningSelect,
  necropsySystems: {
    orderBy: { position: "asc" },
    select: {
      status: true,
      notExaminedReason: true,
      position: true,
      system: { select: { name: true } },
      findings: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          organ: { select: { name: true } },
          tissue: true,
          site: true,
          lesion: true,
          distribution: true,
          severity: true,
          notes: true,
          parasitesPresent: true,
          parasitesCollected: true,
          parasiteCount: true,
        },
      },
    },
  },
  histopathology: {
    orderBy: { position: "asc" },
    select: { position: true, finding: true, organ: { select: { name: true } } },
  },
} as const

/**
 * Recusa a troca de estado que apagaria achados em silêncio.
 *
 * "Sem alteração" afirma que o sistema foi examinado e nada foi encontrado; "não examinado"
 * afirma que nem se olhou. Os dois contradizem achados registrados, então a API recusa e a
 * pessoa remove as linhas antes — em vez de o servidor decidir por ela o que perder.
 */
export function findingsPresentError(count: number): ConflictError {
  return new ConflictError(
    "O sistema tem achados macroscópicos registrados",
    ERROR_CODES.necropsyFindingsPresent,
    { count: String(count) },
  )
}

/** Carrega o pronunciamento de sistema com o animal, para as checagens de acesso. */
export async function loadSystemExam(id: string) {
  const exam = await prisma.necropsySystemExam.findUnique({
    where: { id },
    select: {
      id: true,
      animalId: true,
      systemId: true,
      status: true,
      system: { select: { name: true } },
      _count: { select: { findings: true } },
    },
  })
  if (!exam)
    throw new NotFoundError("Exame de sistema não encontrado", ERROR_CODES.necropsyExamNotFound)
  return exam
}

/** Confere que o sistema (catálogo) existe. */
export async function assertSystemExists(systemId: string) {
  const system = await prisma.necropsySystem.findUnique({
    where: { id: systemId },
    select: { id: true },
  })
  if (!system) throw new NotFoundError("Sistema não encontrado", ERROR_CODES.systemNotFound)
}

/** Próxima posição livre de sistema no laudo do animal. */
export async function nextSystemPosition(animalId: string): Promise<number> {
  const last = await prisma.necropsySystemExam.findFirst({
    where: { animalId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  return (last?.position ?? 0) + 1
}

/** Resolve o animal dono de um achado macroscópico (achado → exame → animal). */
export async function loadGrossFinding(id: string) {
  const finding = await prisma.grossFinding.findUnique({
    where: { id },
    select: {
      id: true,
      examId: true,
      lesion: true,
      exam: { select: { animalId: true, systemId: true } },
    },
  })
  if (!finding)
    throw new NotFoundError("Achado não encontrado", ERROR_CODES.necropsyFindingNotFound)
  return { ...finding, animalId: finding.exam.animalId }
}

/** Resolve o animal dono de um achado histopatológico. */
export async function loadHistopathologyFinding(id: string) {
  const finding = await prisma.histopathologyFinding.findUnique({
    where: { id },
    select: { id: true, animalId: true, organId: true, finding: true },
  })
  if (!finding)
    throw new NotFoundError(
      "Achado histopatológico não encontrado",
      ERROR_CODES.histopathologyFindingNotFound,
    )
  return finding
}

/**
 * Próxima posição livre na lista do pai.
 *
 * A numeração acompanha a ordem de entrada (como na planilha que este laudo substitui) e é
 * atribuída no servidor: o cliente não escolhe posição, então não há como duas abas abertas
 * gravarem a mesma.
 */
export async function nextGrossPosition(examId: string): Promise<number> {
  const last = await prisma.grossFinding.findFirst({
    where: { examId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  return (last?.position ?? 0) + 1
}

export async function nextHistopathologyPosition(animalId: string): Promise<number> {
  const last = await prisma.histopathologyFinding.findFirst({
    where: { animalId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  return (last?.position ?? 0) + 1
}

/** Confere que o órgão (catálogo) existe. */
export async function assertOrganExists(organId: string) {
  const organ = await prisma.organ.findUnique({ where: { id: organId }, select: { id: true } })
  if (!organ) throw new NotFoundError("Órgão não encontrado", ERROR_CODES.organNotFound)
}
