// MARES — Feedback (sugestões e relatos de bug).
// Fluxo: qualquer usuário autenticado envia; o admin global tria (status + resposta ao autor).
// Duas visões, com recortes de coluna DIFERENTES:
//   - admin  (`adminSelect`)  → tudo, incluindo a anotação interna `adminNote`;
//   - autor  (`mineSelect`)   → sem `adminNote` e sem quem revisou (só status + resposta).
// Regras de negócio: descartar (WONT_FIX) exige `resolutionNote`; o autor só corrige o
// próprio relato enquanto ele está NEW. Ver docs/FEEDBACK.md.

import { Prisma, type FeedbackStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import {
  FEEDBACK_RESOLUTION_MIN,
  type UpdateFeedbackData,
  type UpdateMyFeedbackData,
} from "@/schemas/feedback.schema"

// Visão do admin: o registro inteiro.
export const adminSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  pageUrl: true,
  status: true,
  adminNote: true,
  resolutionNote: true,
  reviewedById: true,
  reviewedAt: true,
  createdById: true,
  createdByEmail: true,
  orgId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeedbackSelect

// Visão do autor: o que ele mesmo escreveu + o retorno da administração. `adminNote` fica
// FORA do select (não basta omitir na UI — o recorte é aqui, no servidor).
export const mineSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  pageUrl: true,
  status: true,
  resolutionNote: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeedbackSelect

export type FeedbackAdminRow = Prisma.FeedbackGetPayload<{ select: typeof adminSelect }>
export type FeedbackMineRow = Prisma.FeedbackGetPayload<{ select: typeof mineSelect }>

// ── Leitura ─────────────────────────────────────────────────────────────────
export function listFeedback(status?: FeedbackStatus): Promise<FeedbackAdminRow[]> {
  return prisma.feedback.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    select: adminSelect,
  })
}

export function listMyFeedback(userId: string): Promise<FeedbackMineRow[]> {
  return prisma.feedback.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
    select: mineSelect,
  })
}

// ── Correção pelo autor ─────────────────────────────────────────────────────
// Só enquanto o feedback está NEW: depois que o admin começou a triar, mudar o texto por
// baixo tornaria a triagem (e a justificativa já escrita) inconsistente com o relato.
export async function updateMyFeedback(
  id: string,
  userId: string,
  data: UpdateMyFeedbackData,
): Promise<FeedbackMineRow> {
  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: { createdById: true, status: true },
  })
  // Registro de outro autor responde como inexistente: a mensagem não confirma que o id existe.
  if (!existing || existing.createdById !== userId) {
    throw new NotFoundError("Feedback não encontrado", ERROR_CODES.feedbackNotFound)
  }
  if (existing.status !== "NEW") {
    throw new ForbiddenError(
      "Este feedback já entrou em triagem e não pode mais ser editado",
      ERROR_CODES.feedbackNotEditable,
    )
  }

  // Trava por status: se o admin triar no intervalo entre a checagem e a escrita, o update
  // é no-op (count 0) e o autor recebe o mesmo erro em vez de sobrescrever o relato triado.
  const upd = await prisma.feedback.updateMany({
    where: { id, createdById: userId, status: "NEW" },
    data: {
      type: data.type,
      title: data.title.trim(),
      message: data.message.trim(),
    },
  })
  if (upd.count === 0) {
    throw new ForbiddenError(
      "Este feedback já entrou em triagem e não pode mais ser editado",
      ERROR_CODES.feedbackNotEditable,
    )
  }

  return prisma.feedback.findUniqueOrThrow({ where: { id }, select: mineSelect })
}

// ── Triagem ─────────────────────────────────────────────────────────────────
// Descartar exige justificativa, e a checagem é sobre o ESTADO FINAL (payload aplicado
// sobre o que está salvo). Cobre de uma vez os três caminhos: descartar sem nota, apagar a
// nota de um feedback já descartado e escrever/editar a nota isoladamente.
export function assertResolutionNote(status: FeedbackStatus, resolutionNote: string | null) {
  if (status !== "WONT_FIX") return
  if ((resolutionNote?.trim().length ?? 0) < FEEDBACK_RESOLUTION_MIN) {
    throw new ValidationError(
      "Descartar exige uma justificativa para o autor",
      ERROR_CODES.feedbackResolutionRequired,
    )
  }
}

// `undefined` = campo não enviado (não altera); string vazia/null = limpa.
const normalizeNote = (v: string | null | undefined) =>
  v === undefined ? undefined : v?.trim() || null

export async function updateFeedback(
  id: string,
  reviewerId: string,
  data: UpdateFeedbackData,
): Promise<{ id: string; status: FeedbackStatus }> {
  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: { status: true, resolutionNote: true },
  })
  if (!existing) {
    throw new NotFoundError("Feedback não encontrado", ERROR_CODES.feedbackNotFound)
  }

  const adminNote = normalizeNote(data.adminNote)
  const resolutionNote = normalizeNote(data.resolutionNote)
  const finalStatus = data.status ?? existing.status
  assertResolutionNote(
    finalStatus,
    resolutionNote === undefined ? existing.resolutionNote : resolutionNote,
  )

  // A trilha de triagem só é tocada quando o status realmente muda; editar a resposta
  // depois não reescreve quem/quando decidiu.
  const statusChanged = data.status !== undefined && data.status !== existing.status

  return prisma.feedback.update({
    where: { id },
    data: {
      status: data.status,
      adminNote,
      resolutionNote,
      ...(statusChanged ? { reviewedById: reviewerId, reviewedAt: new Date() } : {}),
    },
    select: { id: true, status: true },
  })
}
