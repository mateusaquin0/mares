// MARES — Solicitações de acesso a uma pesquisa do próprio grupo.
//
// Contexto: a LISTAGEM de pesquisas é aberta a todo membro da organização (catálogo com
// nome, descrição e autor), mas os DADOS (animais, amostras, análises) continuam restritos a
// quem é membro da pesquisa (ResearchMember). Este módulo é a ponte entre os dois: o
// pesquisador pede acesso e quem gere a pesquisa (admin da org ou criador) aprova.
//
// Ver docs/PERMISSOES.md §Escopo por pesquisa.

import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

/**
 * Abre (ou reabre) o pedido de acesso do usuário à pesquisa.
 *
 * Há no máximo UMA linha por par pesquisa×usuário: pedir de novo depois de uma recusa
 * reaproveita a mesma linha, voltando a PENDING. Isso preserva o histórico da última
 * decisão sem acumular pedidos duplicados na fila de quem revisa.
 */
export async function requestResearchAccess(
  researchId: string,
  userId: string,
  message?: string | null,
) {
  const isMember = await prisma.researchMember.findUnique({
    where: { researchId_userId: { researchId, userId } },
    select: { userId: true },
  })
  if (isMember) {
    throw new ConflictError(
      "Você já participa desta pesquisa",
      ERROR_CODES.researchAccessAlreadyMember,
    )
  }

  const existing = await prisma.researchAccessRequest.findUnique({
    where: { researchId_userId: { researchId, userId } },
    select: { id: true, status: true },
  })
  if (existing?.status === "PENDING") {
    throw new ConflictError(
      "Seu pedido já está aguardando resposta",
      ERROR_CODES.researchAccessRequestPending,
    )
  }

  await prisma.researchAccessRequest.upsert({
    where: { researchId_userId: { researchId, userId } },
    create: { researchId, userId, message: message ?? null },
    // Reabertura: zera a decisão anterior para o pedido voltar à fila como novo.
    update: {
      status: "PENDING",
      message: message ?? null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date(),
    },
  })
}

/** Pedido + a pesquisa a que se refere (para a rota checar quem pode revisar). */
export async function loadAccessRequest(id: string) {
  const request = await prisma.researchAccessRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      userId: true,
      researchId: true,
      research: { select: { orgId: true, createdById: true } },
    },
  })
  if (!request) {
    throw new NotFoundError("Pedido não encontrado", ERROR_CODES.researchAccessRequestNotFound)
  }
  return request
}

/**
 * Aprova o pedido: cria o vínculo (ResearchMember) e registra a decisão. Numa transação para
 * não deixar um pedido aprovado sem o vínculo correspondente.
 */
export async function approveResearchAccess(id: string, reviewerId: string) {
  const request = await loadAccessRequest(id)
  if (request.status !== "PENDING") {
    throw new ConflictError(
      "Este pedido já foi respondido",
      ERROR_CODES.researchAccessRequestProcessed,
    )
  }
  await prisma.$transaction([
    prisma.researchMember.upsert({
      where: { researchId_userId: { researchId: request.researchId, userId: request.userId } },
      create: { researchId: request.researchId, userId: request.userId },
      update: {},
    }),
    prisma.researchAccessRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() },
    }),
  ])
}

/** Recusa o pedido (o solicitante pode pedir de novo depois). */
export async function rejectResearchAccess(id: string, reviewerId: string) {
  const request = await loadAccessRequest(id)
  if (request.status !== "PENDING") {
    throw new ConflictError(
      "Este pedido já foi respondido",
      ERROR_CODES.researchAccessRequestProcessed,
    )
  }
  await prisma.researchAccessRequest.update({
    where: { id },
    data: { status: "REJECTED", reviewedById: reviewerId, reviewedAt: new Date() },
  })
}

/**
 * Where dos pedidos que o usuário pode revisar: os das pesquisas que ele gere. Admin da org
 * revisa os de todas; o pesquisador, apenas os das pesquisas que criou.
 */
function reviewableWhere(orgId: string, userId: string, isOrgAdmin: boolean) {
  return {
    status: "PENDING" as const,
    research: isOrgAdmin ? { orgId } : { orgId, createdById: userId },
  }
}

/** Fila consolidada de pedidos pendentes que o usuário pode revisar. */
export async function listReviewableAccessRequests(
  orgId: string,
  userId: string,
  isOrgAdmin: boolean,
) {
  const rows = await prisma.researchAccessRequest.findMany({
    where: reviewableWhere(orgId, userId, isOrgAdmin),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      message: true,
      createdAt: true,
      research: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

/** Quantos pedidos aguardam a revisão do usuário (bolinha do menu). */
export async function countReviewableAccessRequests(
  orgId: string,
  userId: string,
  isOrgAdmin: boolean,
) {
  return prisma.researchAccessRequest.count({ where: reviewableWhere(orgId, userId, isOrgAdmin) })
}

/**
 * Status do pedido do próprio usuário para cada pesquisa da org (alimenta o catálogo: o
 * botão "solicitar acesso" vira "pedido enviado"). Devolve um mapa researchId → status.
 */
export async function myAccessRequestStatus(orgId: string, userId: string) {
  const rows = await prisma.researchAccessRequest.findMany({
    where: { userId, research: { orgId } },
    select: { researchId: true, status: true },
  })
  return new Map(rows.map((r) => [r.researchId, r.status]))
}
