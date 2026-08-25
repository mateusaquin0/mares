// MARES — Solicitações de inclusão no glossário.
// Fluxo: um pesquisador propõe um item; qualquer admin de grupo OU admin global aprova
// (fila única). Ao aprovar, o item é criado pela MESMA lógica da criação direta
// (createCatalogItem), então validação e deduplicação ficam idênticas aos dois caminhos.

import { Prisma, type CatalogRequestType, type CatalogRequestStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  CATALOG_BY_REQUEST_TYPE,
  REQUEST_TYPE_BY_CATALOG,
  type CatalogType,
} from "@/schemas/catalog.schema"
import { catalogRequestPayloadSchema } from "@/schemas/catalog-request.schema"
import {
  assertPathogenFromNcbi,
  catalogExists,
  createCatalogItem,
  findDuplicate,
  updateCatalogItem,
} from "@/lib/catalog"
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { slugify } from "@/lib/slug"

const TYPE_TO_ENUM = REQUEST_TYPE_BY_CATALOG as Record<CatalogType, CatalogRequestType>

export function catalogTypeOf(t: CatalogRequestType): CatalogType {
  return CATALOG_BY_REQUEST_TYPE[t]
}

// Campos devolvidos ao cliente (o e-mail é filtrado no route conforme o papel).
export const requestSelect = {
  id: true,
  type: true,
  payload: true,
  status: true,
  requestedById: true,
  requestedByEmail: true,
  orgId: true,
  orgName: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
  duplicateOfId: true,
  targetId: true,
  createdItemId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CatalogRequestSelect

export type CatalogRequestRow = Prisma.CatalogRequestGetPayload<{ select: typeof requestSelect }>

// Nomes normalizados (sem acento/caixa) candidatos a colisão, extraídos do payload.
function payloadNames(type: CatalogType, payload: Record<string, unknown>): string[] {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? slugify(v) : null)
  if (type === "pathogens") {
    const sci = s(payload.scientificName)
    if (sci) return [sci]
  }
  return [s(payload.namePt), s(payload.nameEn)].filter((x): x is string => !!x)
}

// ── Criação ─────────────────────────────────────────────────────────────────
export async function createCatalogRequest(opts: {
  type: CatalogType
  payload: unknown
  // Preenchido = proposta de EDIÇÃO do item; ausente = inclusão de item novo.
  targetId?: string
  userId: string
  userEmail: string
  orgId: string | null
  orgName: string | null
}): Promise<CatalogRequestRow> {
  // O alvo precisa existir NO TIPO pedido: sem isso, um id de outro catálogo passaria e só
  // falharia na aprovação, já na frente do curador.
  if (opts.targetId && !(await catalogExists(opts.type, opts.targetId))) {
    throw new NotFoundError("Item do glossário não encontrado", ERROR_CODES.catalogNotFound)
  }
  // Valida o payload conforme o tipo (mesmas regras da criação). ZodError → 422.
  const parsed = catalogRequestPayloadSchema(opts.type).parse(opts.payload) as Record<
    string,
    unknown
  >

  // Patógeno científico: exige seleção do NCBI (taxonId) já na solicitação (feedback imediato).
  if (opts.type === "pathogens") {
    const sci = typeof parsed.scientificName === "string" ? parsed.scientificName.trim() : ""
    assertPathogenFromNcbi(sci || null, typeof parsed.taxonId === "number" ? parsed.taxonId : null)
  }

  // Edição: a colisão que importa é já haver uma proposta pendente PARA O MESMO ITEM — de
  // qualquer autor, porque duas edições concorrentes do mesmo item se sobrescreveriam na
  // aprovação. (Na inclusão a colisão é por nome, logo abaixo.)
  if (opts.targetId) {
    const pendingForTarget = await prisma.catalogRequest.count({
      where: { targetId: opts.targetId, status: "PENDING" },
    })
    if (pendingForTarget > 0) {
      throw new ConflictError(
        "Já existe uma edição pendente para este item",
        ERROR_CODES.catalogRequestDuplicatePending,
      )
    }
  }

  // Dedup: bloqueia solicitação pendente idêntica do PRÓPRIO autor (mesmo tipo + mesmo nome).
  const names = opts.targetId ? [] : payloadNames(opts.type, parsed)
  if (names.length) {
    const pending = await prisma.catalogRequest.findMany({
      where: { requestedById: opts.userId, type: TYPE_TO_ENUM[opts.type], status: "PENDING" },
      select: { payload: true },
    })
    const clash = pending.some((p) =>
      payloadNames(opts.type, p.payload as Record<string, unknown>).some((n) => names.includes(n)),
    )
    if (clash) {
      throw new ConflictError(
        "Você já tem uma solicitação pendente para este item",
        ERROR_CODES.catalogRequestDuplicatePending,
      )
    }
  }

  return prisma.catalogRequest.create({
    data: {
      type: TYPE_TO_ENUM[opts.type],
      targetId: opts.targetId ?? null,
      payload: parsed as Prisma.InputJsonValue,
      requestedById: opts.userId,
      requestedByEmail: opts.userEmail,
      orgId: opts.orgId,
      orgName: opts.orgName,
    },
    select: requestSelect,
  })
}

// ── Listagens ───────────────────────────────────────────────────────────────
export async function listReviewableRequests(
  status?: CatalogRequestStatus,
): Promise<CatalogRequestRow[]> {
  return prisma.catalogRequest.findMany({
    where: status ? { status } : undefined,
    // Fila: pendentes mais antigas primeiro; histórico (resolvidas) mais recentes primeiro.
    orderBy: status === "PENDING" ? { createdAt: "asc" } : { createdAt: "desc" },
    select: requestSelect,
  })
}

export async function listMyRequests(userId: string): Promise<CatalogRequestRow[]> {
  return prisma.catalogRequest.findMany({
    where: { requestedById: userId },
    orderBy: { createdAt: "desc" },
    select: requestSelect,
  })
}

export function countPendingRequests(): Promise<number> {
  return prisma.catalogRequest.count({ where: { status: "PENDING" } })
}

// ── Curadoria ───────────────────────────────────────────────────────────────
function assertReviewable(
  req: { status: CatalogRequestStatus; requestedById: string | null },
  reviewerId: string,
) {
  if (req.status !== "PENDING") {
    throw new ConflictError("Solicitação já processada", ERROR_CODES.catalogRequestProcessed)
  }
  // Integridade: ninguém aprova/rejeita a própria solicitação (mesmo já sendo admin agora).
  if (req.requestedById && req.requestedById === reviewerId) {
    throw new ForbiddenError(
      "Você não pode revisar a própria solicitação",
      ERROR_CODES.catalogRequestSelfReview,
    )
  }
}

export async function approveCatalogRequest(
  id: string,
  reviewerId: string,
): Promise<{ createdItemId: string }> {
  const req = await prisma.catalogRequest.findUnique({ where: { id }, select: requestSelect })
  if (!req)
    throw new NotFoundError("Solicitação não encontrada", ERROR_CODES.catalogRequestNotFound)
  assertReviewable(req, reviewerId)

  const type = CATALOG_BY_REQUEST_TYPE[req.type]
  try {
    // Solicitação de EDIÇÃO: aplica no item apontado pelo mesmo caminho da edição direta.
    // O item pode ter sido excluído entre o pedido e a revisão — daí a checagem.
    if (req.targetId) {
      if (!(await catalogExists(type, req.targetId))) {
        throw new NotFoundError("Item do glossário não encontrado", ERROR_CODES.catalogNotFound)
      }
      const edited = await updateCatalogItem(type, req.targetId, req.payload)
      await prisma.catalogRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "APPROVED",
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          createdItemId: edited.id,
        },
      })
      return { createdItemId: edited.id }
    }

    const item = await createCatalogItem(type, req.payload, req.requestedById ?? reviewerId)
    // Trava por status: se outro revisor processou no intervalo, este update é no-op (count 0).
    await prisma.catalogRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        createdItemId: item.id,
      },
    })
    return { createdItemId: item.id }
  } catch (e) {
    // Nome já existe (aprovação simultânea / criado direto no intervalo): auto-rejeita como
    // duplicata apontando o item canônico, e propaga o conflito para o revisor.
    if (e instanceof ConflictError && e.code === ERROR_CODES.catalogDuplicate) {
      const duplicateOfId = await findDuplicate(type, req.payload)
      await prisma.catalogRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNote: "duplicate",
          duplicateOfId,
        },
      })
    }
    throw e
  }
}

export async function rejectCatalogRequest(
  id: string,
  reviewerId: string,
  note: string | null,
): Promise<void> {
  const req = await prisma.catalogRequest.findUnique({
    where: { id },
    select: { status: true, requestedById: true },
  })
  if (!req)
    throw new NotFoundError("Solicitação não encontrada", ERROR_CODES.catalogRequestNotFound)
  assertReviewable(req, reviewerId)

  const upd = await prisma.catalogRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  })
  if (upd.count === 0) {
    throw new ConflictError("Solicitação já processada", ERROR_CODES.catalogRequestProcessed)
  }
}
