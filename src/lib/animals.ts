// MARES — Helpers de acesso a animais (Fase 3).
// Um animal pertence a uma pesquisa, que pertence a uma organização. O acesso é validado
// pelo Membership do usuário naquela organização (ver docs/PERMISSOES.md §Animais).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ACCEPTED_PARTICIPATION } from "@/lib/animal-participation"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import type { ResearchScope } from "@/lib/research-access"
import { pathogenName, type I18nText } from "@/lib/catalog-i18n"

/** Qual identificador único o P2002 violou (a partir de `meta.target`). */
function duplicateField(e: Prisma.PrismaClientKnownRequestError): "simba" | "control" | null {
  const target = Array.isArray(e.meta?.target)
    ? e.meta.target.join(",")
    : String(e.meta?.target ?? "")
  if (/simba/i.test(target)) return "simba"
  if (/control/i.test(target)) return "control"
  return null
}

/**
 * Traduz a violação de unicidade (P2002) do animal no erro mais específico possível,
 * indicando QUAL identificador está duplicado (ID de controle ou Nº SIMBA).
 */
export function animalDuplicateError(e: Prisma.PrismaClientKnownRequestError): ConflictError {
  switch (duplicateField(e)) {
    case "simba":
      return new ConflictError(
        "Identificador SIMBA já cadastrado",
        ERROR_CODES.animalSimbaDuplicate,
      )
    case "control":
      return new ConflictError("ID de controle já cadastrado", ERROR_CODES.animalControlDuplicate)
    default:
      return new ConflictError("ID já cadastrado", ERROR_CODES.animalDuplicate)
  }
}

/**
 * Versão contextualizada de `animalDuplicateError`: os identificadores são únicos por
 * ORGANIZAÇÃO (`@@unique([orgId, controlId])`), mas a listagem de animais é filtrada por
 * PESQUISA — a mensagem genérica ("já cadastrado") deixa a pessoa procurando um registro
 * que pode estar em qualquer lugar. Aqui localizamos o animal em conflito e SEMPRE nomeamos
 * a pesquisa que o detém; o que muda é o desfecho:
 *
 *   • pesquisa VISÍVEL ao usuário → basta apontar onde está (ele abre e confere);
 *   • pesquisa FORA do escopo     → além de nomear, devolvemos a identidade mínima do
 *     indivíduo e o `animalId`, para a UI oferecer pedir o compartilhamento.
 *
 * A identidade mínima (espécie, data do evento, local) existe porque sem ela a pessoa não
 * consegue decidir o que fazer: se é o MESMO indivíduo, ela pede o compartilhamento; se os
 * dados divergem, o que há é um identificador digitado errado — e ela corrige. É informação
 * de identificação do mesmo indivíduo físico, não dados científicos da outra pesquisa
 * (amostras e análises seguem inacessíveis).
 *
 * Cai no erro genérico quando o valor em conflito não foi informado (ex.: PUT parcial que
 * não mexe no campo) ou quando o animal não é localizável.
 */
export async function animalDuplicateConflict(
  e: Prisma.PrismaClientKnownRequestError,
  ctx: {
    orgId: string
    scope: ResearchScope
    controlId?: string | null
    simbaRecordNumber?: string | null
  },
): Promise<ConflictError> {
  const field = duplicateField(e)
  const value =
    field === "simba" ? ctx.simbaRecordNumber : field === "control" ? ctx.controlId : null
  if (!field || !value) return animalDuplicateError(e)

  const clash = await findAnimalByIdentifier(ctx.orgId, ctx.scope, {
    [field === "simba" ? "simbaRecordNumber" : "controlId"]: value,
  })
  if (!clash) return animalDuplicateError(e)

  const { research, visible } = clash

  if (visible) {
    // `animalId` permite à UI oferecer "abrir o registro" — que é a saída natural quando a
    // pessoa já enxerga o duplicado (identidade extra é desnecessária: ela abre e confere).
    const params = { research, animalId: clash.animalId }
    return field === "simba"
      ? new ConflictError(
          `Identificador SIMBA já cadastrado na pesquisa "${research}"`,
          ERROR_CODES.animalSimbaDuplicateInResearch,
          params,
        )
      : new ConflictError(
          `ID de controle já cadastrado na pesquisa "${research}"`,
          ERROR_CODES.animalControlDuplicateInResearch,
          params,
        )
  }

  // `animalId` e a identidade não interpolam a mensagem: viajam junto para a UI oferecer
  // "pedir o indivíduo para a minha pesquisa" (ver POST /api/animals/[id]/researches).
  const params = {
    research,
    animalId: clash.animalId,
    species: clash.species,
    eventDate: clash.eventDate,
    location: clash.location,
  }
  return field === "simba"
    ? new ConflictError(
        `Identificador SIMBA já cadastrado na pesquisa "${research}"`,
        ERROR_CODES.animalSimbaDuplicateOutOfScope,
        params,
      )
    : new ConflictError(
        `ID de controle já cadastrado na pesquisa "${research}"`,
        ERROR_CODES.animalControlDuplicateOutOfScope,
        params,
      )
}

/**
 * Localiza o indivíduo de uma organização por um dos identificadores únicos e diz se ele é
 * VISÍVEL ao usuário, junto da identidade mínima.
 *
 * Fonte única para as duas portas que fazem a mesma pergunta — "este identificador já existe
 * no grupo?": a busca prévia do formulário (GET /api/animals/lookup) e o conflito do POST
 * (`animalDuplicateConflict`). Se divergissem, a busca diria "livre" e o envio recusaria, ou
 * pior, a busca exporia o que o conflito protege.
 */
export async function findAnimalByIdentifier(
  orgId: string,
  scope: ResearchScope,
  by: { controlId?: string; simbaRecordNumber?: string },
) {
  const where: Prisma.AnimalWhereInput = by.simbaRecordNumber
    ? { orgId, simbaRecordNumber: by.simbaRecordNumber }
    : { orgId, controlId: by.controlId }
  if (!by.simbaRecordNumber && !by.controlId) return null

  const animal = await prisma.animal.findFirst({
    where,
    select: {
      id: true,
      researchId: true,
      species: true,
      eventDate: true,
      municipality: true,
      state: true,
      research: { select: { name: true } },
      // Só as participações ACEITAS: um convite pendente ainda não dá acesso ao indivíduo.
      participations: { where: ACCEPTED_PARTICIPATION, select: { researchId: true } },
    },
  })
  if (!animal) return null

  // Visível = admin da org, ou alguma pesquisa do conjunto efetivo (primária ∪ participações
  // aceitas) está no escopo do usuário.
  const visible =
    scope.all ||
    scope.ids.includes(animal.researchId) ||
    animal.participations.some((p) => scope.ids.includes(p.researchId))

  return {
    animalId: animal.id,
    research: animal.research.name,
    researchId: animal.researchId,
    visible,
    species: animal.species ?? "",
    eventDate: animal.eventDate?.toISOString() ?? "",
    location: [animal.municipality, animal.state].filter(Boolean).join(", "),
  }
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
  species?: Nullable<string>
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
    // Já vem trim/nulável do schema (optionalText). null = espécie indeterminada.
    species: input.species,
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
  // Só as ACEITAS: convite pendente não aparece como participante na listagem.
  participations: {
    where: ACCEPTED_PARTICIPATION,
    select: { research: { select: { id: true, name: true } } },
  },
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

/**
 * Cria o vínculo entre o indivíduo e OUTRA pesquisa da mesma org. O vínculo nasce PENDING e
 * só vale quando o lado que ainda não consentiu aceita — `origin` diz quem é esse lado:
 *
 *   INVITE  → partiu de quem já enxerga o indivíduo; responde a pesquisa CONVIDADA.
 *   REQUEST → partiu de quem quer o indivíduo na sua pesquisa; responde a pesquisa PRIMÁRIA.
 *
 * É o que permite abrir o catálogo de pesquisas do grupo sem que ninguém empurre dados para
 * dentro do escopo alheio nem se sirva do escopo alheio.
 *
 * `autoAccept` cobre o caso em que quem age já enxerga OS DOIS lados (membro das duas
 * pesquisas, ou admin da org): não faz sentido pedir a própria autorização.
 */
export async function createAnimalShare(
  animalId: string,
  orgId: string,
  researchId: string,
  opts: {
    origin: "INVITE" | "REQUEST"
    invitedById: string
    autoAccept: boolean
    message?: string | null
  },
) {
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
    await prisma.animalResearch.create({
      data: {
        animalId,
        researchId,
        origin: opts.origin,
        status: opts.autoAccept ? "ACCEPTED" : "PENDING",
        invitedById: opts.invitedById,
        message: opts.message ?? null,
        respondedAt: opts.autoAccept ? new Date() : null,
      },
    })
    return opts.autoAccept ? ("ACCEPTED" as const) : ("PENDING" as const)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Distingue "já participa" de "já existe pedido em aberto" — ações diferentes para
      // quem recebe a mensagem (nada a fazer × aguardar a resposta do outro lado).
      const existing = await prisma.animalResearch.findUnique({
        where: { animalId_researchId: { animalId, researchId } },
        select: { status: true },
      })
      throw new ConflictError(
        existing?.status === "PENDING"
          ? "Já existe um pedido de compartilhamento em aberto"
          : "Esta pesquisa já compartilha o indivíduo",
        existing?.status === "PENDING"
          ? ERROR_CODES.animalSharePending
          : ERROR_CODES.animalResearchExists,
      )
    }
    throw e
  }
}

/**
 * Carrega um vínculo pendente/aceito com o que as rotas precisam para autorizar a resposta:
 * a pesquisa que decide (`deciderResearchId`) depende da origem.
 */
export async function loadAnimalShare(animalId: string, researchId: string) {
  const share = await prisma.animalResearch.findUnique({
    where: { animalId_researchId: { animalId, researchId } },
    select: {
      status: true,
      origin: true,
      researchId: true,
      animal: { select: { orgId: true, researchId: true } },
    },
  })
  if (!share) {
    throw new NotFoundError("Compartilhamento não encontrado", ERROR_CODES.animalShareNotFound)
  }
  return {
    status: share.status,
    origin: share.origin,
    orgId: share.animal.orgId,
    // Quem responde é sempre o lado que ainda não consentiu.
    deciderResearchId: share.origin === "INVITE" ? share.researchId : share.animal.researchId,
    // O outro lado — quem pode CANCELAR o que iniciou.
    requesterResearchId: share.origin === "INVITE" ? share.animal.researchId : share.researchId,
  }
}

/**
 * Aceita o compartilhamento. Quem chama já validou que o usuário pertence à pesquisa que
 * decide (ver `loadAnimalShare`).
 */
export async function acceptAnimalShare(animalId: string, researchId: string) {
  const share = await prisma.animalResearch.findUnique({
    where: { animalId_researchId: { animalId, researchId } },
    select: { status: true },
  })
  if (!share) {
    throw new NotFoundError("Compartilhamento não encontrado", ERROR_CODES.animalShareNotFound)
  }
  // Idempotente: aceitar de novo (dois membros clicando junto) não é erro.
  if (share.status === "ACCEPTED") return
  await prisma.animalResearch.update({
    where: { animalId_researchId: { animalId, researchId } },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  })
}

/**
 * Where das pendências que o usuário PODE responder: convite dirigido a uma pesquisa sua, ou
 * pedido sobre um indivíduo cuja pesquisa primária é sua. `researchIds` undefined = admin da
 * org (responde por todas as pesquisas do grupo).
 */
function pendingShareWhere(orgId: string, researchIds?: string[]): Prisma.AnimalResearchWhereInput {
  const base: Prisma.AnimalResearchWhereInput = {
    status: "PENDING",
    animal: { orgId },
  }
  if (!researchIds) return base
  return {
    ...base,
    OR: [
      { origin: "INVITE", researchId: { in: researchIds } },
      { origin: "REQUEST", animal: { orgId, researchId: { in: researchIds } } },
    ],
  }
}

/**
 * Compartilhamentos PENDENTES que o usuário pode responder (a caixa de entrada). Traz os dois
 * sentidos: convites recebidos e pedidos feitos sobre os indivíduos das pesquisas dele.
 */
export async function listPendingShares(orgId: string, researchIds?: string[]) {
  if (researchIds?.length === 0) return []
  const rows = await prisma.animalResearch.findMany({
    where: pendingShareWhere(orgId, researchIds),
    orderBy: { createdAt: "desc" },
    select: {
      origin: true,
      message: true,
      createdAt: true,
      research: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
      animal: {
        select: {
          id: true,
          species: true,
          controlId: true,
          simbaRecordNumber: true,
          municipality: true,
          state: true,
          eventDate: true,
          research: { select: { id: true, name: true } },
        },
      },
    },
  })
  return rows.map(({ animal, research, ...r }) => {
    const { research: fromResearch, ...rest } = animal
    return {
      ...r,
      createdAt: r.createdAt.toISOString(),
      animal: { ...rest, eventDate: rest.eventDate?.toISOString() ?? null },
      // `research` = a pesquisa que ganha o indivíduo; `fromResearch` = a de origem (primária).
      research,
      fromResearch,
    }
  })
}

/** Quantas pendências de compartilhamento aguardam resposta do usuário. */
export async function countPendingShares(orgId: string, researchIds?: string[]) {
  if (researchIds?.length === 0) return 0
  return prisma.animalResearch.count({ where: pendingShareWhere(orgId, researchIds) })
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
      participations: {
        where: { researchId, ...ACCEPTED_PARTICIPATION },
        select: { researchId: true },
      },
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
