// MARES — Feedback (sugestões e relatos de bug).
// Fluxo: qualquer usuário autenticado envia; o admin global tria (status + resposta ao autor).
// Duas visões, com recortes de coluna DIFERENTES:
//   - admin  (`adminSelect`)  → tudo, incluindo a anotação interna `adminNote`;
//   - autor  (`mineSelect`)   → sem `adminNote` e sem quem revisou (só status + resposta).
// Regras de negócio: descartar (WONT_FIX) exige `resolutionNote`; o autor só corrige o
// próprio relato enquanto ele está NEW; a CONVERSA do ticket (mensagens + anexos) só
// aceita escrita enquanto o ticket está aberto. Ver docs/FEEDBACK.md.

import { Prisma, type FeedbackParty, type FeedbackStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { signMediaUrl } from "@/lib/media"
import { FEEDBACK_ATTACHMENT_MAX_PER_TICKET, FEEDBACK_BUCKET } from "@/lib/feedback-media"
import {
  FEEDBACK_RESOLUTION_MIN,
  type UpdateFeedbackData,
  type UpdateMyFeedbackData,
} from "@/schemas/feedback.schema"

// Resumo da conversa que acompanha CADA linha das duas listas. A última mensagem basta
// para saber se há novidade: numa conversa de dois lados, se a última é minha, não há o
// que ler. Evita carregar a thread inteira só para acender um indicador.
const threadMetaSelect = {
  authorReadAt: true,
  adminReadAt: true,
  _count: { select: { messages: true, attachments: true } },
  messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, party: true } },
} satisfies Prisma.FeedbackSelect

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
  // Nome VIVO do autor (o ticket só guarda o snapshot do e-mail). Some se o usuário for
  // removido — daí a UI cair no e-mail, que é o identificador estável.
  createdBy: { select: { name: true } },
  orgId: true,
  createdAt: true,
  updatedAt: true,
  ...threadMetaSelect,
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
  ...threadMetaSelect,
} satisfies Prisma.FeedbackSelect

// Campos do resumo que NÃO saem crus para o cliente: os marcadores de leitura dos dois
// lados e a última mensagem viram um punhado de números e um booleano em `threadSummary`.
type ThreadMetaFields = "authorReadAt" | "adminReadAt" | "_count" | "messages"

export type FeedbackThreadSummary = {
  messageCount: number
  attachmentCount: number
  lastMessageAt: Date | null
  // Existe mensagem do OUTRO lado depois da última vez que ESTE lado abriu a conversa.
  unread: boolean
}

export type FeedbackAdminRow = Omit<
  Prisma.FeedbackGetPayload<{ select: typeof adminSelect }>,
  ThreadMetaFields | "createdBy"
> &
  FeedbackThreadSummary & { createdByName: string | null }

export type FeedbackMineRow = Omit<
  Prisma.FeedbackGetPayload<{ select: typeof mineSelect }>,
  ThreadMetaFields
> &
  FeedbackThreadSummary

// Achata o resumo da conversa na perspectiva de UM lado e descarta os campos crus.
function withThreadSummary<
  T extends {
    authorReadAt: Date | null
    adminReadAt: Date | null
    _count: { messages: number; attachments: number }
    messages: { createdAt: Date; party: FeedbackParty }[]
  },
>(row: T, party: FeedbackParty): Omit<T, ThreadMetaFields> & FeedbackThreadSummary {
  const { authorReadAt, adminReadAt, _count, messages, ...rest } = row
  const last = messages[0] ?? null
  const readAt = party === "ADMIN" ? adminReadAt : authorReadAt
  return {
    ...rest,
    messageCount: _count.messages,
    attachmentCount: _count.attachments,
    lastMessageAt: last?.createdAt ?? null,
    // A própria mensagem nunca acende o aviso — só a do outro lado, e só se chegou depois
    // da última leitura.
    unread: !!last && last.party !== party && (!readAt || last.createdAt > readAt),
  }
}

// ── Leitura ─────────────────────────────────────────────────────────────────
export async function listFeedback(status?: FeedbackStatus): Promise<FeedbackAdminRow[]> {
  const rows = await prisma.feedback.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    select: adminSelect,
  })
  return rows.map(({ createdBy, ...r }) => ({
    ...withThreadSummary(r, "ADMIN"),
    createdByName: createdBy?.name ?? null,
  }))
}

export async function listMyFeedback(userId: string): Promise<FeedbackMineRow[]> {
  const rows = await prisma.feedback.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
    select: mineSelect,
  })
  return rows.map((r) => withThreadSummary(r, "AUTHOR"))
}

/** Tickets do autor com resposta não lida da administração (bolinha do menu lateral). */
export async function countMyUnreadReplies(userId: string): Promise<number> {
  const rows = await prisma.feedback.findMany({
    where: { createdById: userId, messages: { some: { party: "ADMIN" } } },
    select: threadMetaSelect,
  })
  return rows.filter((r) => withThreadSummary(r, "AUTHOR").unread).length
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

  const row = await prisma.feedback.findUniqueOrThrow({ where: { id }, select: mineSelect })
  return withThreadSummary(row, "AUTHOR")
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
  // Quem tria: o id vai para a trilha, e o e-mail assina a mensagem do descarte.
  reviewer: { id: string; email: string },
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

  // Entrando em WONT_FIX, a justificativa entra na conversa como uma mensagem NORMAL da
  // administração: é o que o autor precisa ler, no mesmo lugar onde ele lê o resto. Como
  // qualquer mensagem, ela é imutável — mexer na `resolutionNote` depois não a reescreve.
  const discarding = finalStatus === "WONT_FIX" && existing.status !== "WONT_FIX"
  const finalNote = resolutionNote === undefined ? existing.resolutionNote : resolutionNote

  return prisma.feedback.update({
    where: { id },
    data: {
      status: data.status,
      adminNote,
      resolutionNote,
      ...(statusChanged ? { reviewedById: reviewer.id, reviewedAt: new Date() } : {}),
      ...(discarding && finalNote
        ? {
            messages: {
              create: {
                body: finalNote,
                party: "ADMIN",
                createdById: reviewer.id,
                createdByEmail: reviewer.email,
              },
            },
          }
        : {}),
    },
    select: { id: true, status: true },
  })
}

// ── Conversa do ticket ──────────────────────────────────────────────────────
// O relato congela quando entra em triagem (updateMyFeedback), e é justamente aí que a
// conversa serve: alinhar uma sugestão ou descobrir como reproduzir um bug falando com
// quem reportou. Encerrar o ticket fecha a conversa para OS DOIS lados — assim o histórico
// termina na decisão registrada, em vez de continuar depois dela; o autor que discorda
// pede reabertura (requestReopen), e aí a conversa volta a aceitar mensagens.
const OPEN_STATUSES: FeedbackStatus[] = ["NEW", "IN_REVIEW", "REOPENED"]
const CLOSED_STATUSES: FeedbackStatus[] = ["RESOLVED", "WONT_FIX"]

export const isThreadOpen = (status: FeedbackStatus) => OPEN_STATUSES.includes(status)

// Quem age na conversa. `isSystemAdmin` decide o LADO, não o acesso: o acesso é ser autor
// do ticket ou admin global.
export type ThreadActor = { id: string; email: string; isSystemAdmin: boolean }

export type FeedbackThreadAccess = {
  id: string
  status: FeedbackStatus
  party: FeedbackParty
  open: boolean
}

/**
 * Resolve o LADO de quem acessa a conversa e devolve o ticket. Quem não participa recebe
 * "não encontrado" — a mensagem não confirma que aquele id existe (mesma regra de
 * `updateMyFeedback`).
 */
export async function loadThreadAccess(
  feedbackId: string,
  actor: ThreadActor,
): Promise<FeedbackThreadAccess> {
  const fb = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { id: true, status: true, createdById: true },
  })
  const isAuthor = !!fb && !!fb.createdById && fb.createdById === actor.id
  if (!fb || (!isAuthor && !actor.isSystemAdmin)) {
    throw new NotFoundError("Feedback não encontrado", ERROR_CODES.feedbackNotFound)
  }
  // Admin global que abre o PRÓPRIO ticket conversa como autor: do contrário responderia a
  // si mesmo em nome da administração, e o histórico ficaria ilegível.
  const party: FeedbackParty = isAuthor ? "AUTHOR" : "ADMIN"
  return { id: fb.id, status: fb.status, party, open: isThreadOpen(fb.status) }
}

const attachmentSelect = {
  id: true,
  messageId: true,
  url: true,
  mimeType: true,
  filename: true,
  size: true,
  uploadedById: true,
  uploadedByParty: true,
  createdAt: true,
} satisfies Prisma.FeedbackAttachmentSelect

type AttachmentPayload = Prisma.FeedbackAttachmentGetPayload<{ select: typeof attachmentSelect }>

export type FeedbackAttachmentRow = Omit<AttachmentPayload, "url"> & {
  // URL assinada temporária; `null` se o Storage falhar ao assinar (a UI mostra o nome).
  url: string | null
}

export type FeedbackMessageRow = {
  id: string
  body: string
  party: FeedbackParty
  // Quem escreveu — nome vivo, e o e-mail como identificador estável. Os DOIS voltam `null`
  // nas mensagens da administração vistas PELO AUTOR: ele acompanha o ticket, não a
  // identidade de quem tria (mesma razão de `mineSelect` não devolver `reviewedById`).
  createdByName: string | null
  createdByEmail: string | null
  createdAt: Date
  attachments: FeedbackAttachmentRow[]
}

export type FeedbackThread = {
  status: FeedbackStatus
  // Lado de quem está lendo, para a UI alinhar os balões e rotular o autor das mensagens.
  party: FeedbackParty
  open: boolean
  // Imagens do relato original (as que não pertencem a nenhuma mensagem).
  reportAttachments: FeedbackAttachmentRow[]
  messages: FeedbackMessageRow[]
}

// Troca o caminho do objeto por uma URL assinada temporária (bucket privado).
function signAttachments(rows: AttachmentPayload[]): Promise<FeedbackAttachmentRow[]> {
  return Promise.all(
    rows.map(async (a) => ({ ...a, url: await signMediaUrl(a.url, FEEDBACK_BUCKET) })),
  )
}

export async function listThread(
  feedbackId: string,
  access: FeedbackThreadAccess,
): Promise<FeedbackThread> {
  const [messages, reportRows] = await Promise.all([
    prisma.feedbackMessage.findMany({
      where: { feedbackId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        party: true,
        createdByEmail: true,
        createdBy: { select: { name: true } },
        createdAt: true,
        attachments: { orderBy: { createdAt: "asc" }, select: attachmentSelect },
      },
    }),
    prisma.feedbackAttachment.findMany({
      where: { feedbackId, messageId: null },
      orderBy: { createdAt: "asc" },
      select: attachmentSelect,
    }),
  ])

  const hideAdminIdentity = access.party === "AUTHOR"
  return {
    status: access.status,
    party: access.party,
    open: access.open,
    reportAttachments: await signAttachments(reportRows),
    messages: await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        body: m.body,
        party: m.party,
        // Recorte por lado: a administração é anônima para o autor.
        createdByName:
          hideAdminIdentity && m.party === "ADMIN" ? null : (m.createdBy?.name ?? null),
        createdByEmail: hideAdminIdentity && m.party === "ADMIN" ? null : m.createdByEmail,
        createdAt: m.createdAt,
        attachments: await signAttachments(m.attachments),
      })),
    ),
  }
}

/** Traduz "nenhuma linha bateu com o where" (P2025) do Prisma no erro de domínio. */
function rethrowAs(err: unknown, error: Error): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw error
  throw err
}

const threadClosedError = () =>
  new ForbiddenError(
    "Este ticket foi encerrado e a conversa está fechada",
    ERROR_CODES.feedbackThreadClosed,
  )

/**
 * Publica uma mensagem. A trava de status vive no `where` do update do ticket: se ele for
 * encerrado entre a leitura e a escrita, o UPDATE não casa e o INSERT aninhado nem chega a
 * acontecer — em vez de gravar uma resposta num ticket já fechado.
 * O id é gerado aqui para que a rota consiga anexar imagens à mensagem recém-criada.
 */
export async function addThreadMessage(
  feedbackId: string,
  actor: ThreadActor,
  party: FeedbackParty,
  body: string,
): Promise<FeedbackMessageRow> {
  const text = body.trim()
  const id = crypto.randomUUID()
  await prisma.feedback
    .update({
      where: { id: feedbackId, status: { in: OPEN_STATUSES } },
      data: {
        messages: {
          create: { id, body: text, party, createdById: actor.id, createdByEmail: actor.email },
        },
      },
      select: { id: true },
    })
    .catch((err) => rethrowAs(err, threadClosedError()))

  // Quem acabou de escrever leu tudo até aqui — sem isto a própria mensagem voltaria
  // marcada como novidade na lista de quem a escreveu.
  await markThreadRead(feedbackId, party)

  return {
    id,
    body: text,
    party,
    // Quem acabou de escrever é quem está lendo — a UI rotula como "Você" de todo jeito.
    createdByName: null,
    createdByEmail: actor.email,
    createdAt: new Date(),
    attachments: [],
  }
}

/**
 * Marca a conversa como lida por um LADO. SQL cru de propósito: `prisma.update` dispararia
 * `@updatedAt` no ticket, e abrir uma conversa não é uma alteração do feedback.
 */
export async function markThreadRead(feedbackId: string, party: FeedbackParty): Promise<void> {
  if (party === "ADMIN") {
    await prisma.$executeRaw`UPDATE "Feedback" SET "adminReadAt" = NOW() WHERE "id" = ${feedbackId}`
  } else {
    await prisma.$executeRaw`UPDATE "Feedback" SET "authorReadAt" = NOW() WHERE "id" = ${feedbackId}`
  }
}

// ── Reabertura pedida pelo autor ────────────────────────────────────────────
/**
 * O autor pede para revisitar um ticket encerrado. Vira o status `REOPENED` — e não uma
 * volta a `NEW`/`IN_REVIEW` — para a fila do admin separar "chegou agora" de "quem
 * reportou não concorda com o encerramento".
 *
 * A justificativa entra como a primeira mensagem da conversa reaberta, em vez de virar
 * mais um campo: é exatamente o que o admin precisa ler, e no lugar onde vai respondê-la.
 *
 * A trilha de triagem (`reviewedById`/`reviewedAt`) NÃO é tocada: ela registra a última
 * decisão da administração, e o pedido do autor não é uma decisão.
 */
export async function requestReopen(
  feedbackId: string,
  actor: ThreadActor,
  reason: string,
): Promise<{ id: string; status: FeedbackStatus }> {
  const existing = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { createdById: true, status: true },
  })
  // Ticket de outro autor responde como inexistente (mesma regra de updateMyFeedback).
  if (!existing || existing.createdById !== actor.id) {
    throw new NotFoundError("Feedback não encontrado", ERROR_CODES.feedbackNotFound)
  }
  if (!CLOSED_STATUSES.includes(existing.status)) {
    throw new ForbiddenError(
      "Só um ticket encerrado pode ser reaberto",
      ERROR_CODES.feedbackNotReopenable,
    )
  }

  // Trava por status na escrita: se o admin mexer no ticket no intervalo, o UPDATE não
  // casa e nada é gravado — em vez de reabrir por cima de uma triagem nova.
  const updated = await prisma.feedback
    .update({
      where: { id: feedbackId, createdById: actor.id, status: { in: CLOSED_STATUSES } },
      data: {
        status: "REOPENED",
        messages: {
          create: {
            body: reason.trim(),
            party: "AUTHOR",
            createdById: actor.id,
            createdByEmail: actor.email,
          },
        },
      },
      select: { id: true, status: true },
    })
    .catch((err) =>
      rethrowAs(
        err,
        new ForbiddenError(
          "Só um ticket encerrado pode ser reaberto",
          ERROR_CODES.feedbackNotReopenable,
        ),
      ),
    )

  await markThreadRead(feedbackId, "AUTHOR")
  return updated
}

// ── Anexos de imagem ────────────────────────────────────────────────────────
/**
 * Registra uma imagem já enviada ao Storage. O teto por ticket é conferido aqui (e não só
 * na UI) e vale para os dois lados somados, contando relato + conversa.
 */
export async function addAttachment(input: {
  feedbackId: string
  messageId: string | null
  actor: ThreadActor
  party: FeedbackParty
  path: string
  mimeType: string
  filename: string
  size: number
}): Promise<{ id: string }> {
  const used = await prisma.feedbackAttachment.count({ where: { feedbackId: input.feedbackId } })
  if (used >= FEEDBACK_ATTACHMENT_MAX_PER_TICKET) {
    throw new ValidationError(
      `Limite de ${FEEDBACK_ATTACHMENT_MAX_PER_TICKET} imagens por ticket`,
      ERROR_CODES.feedbackAttachmentLimit,
    )
  }

  // Mesma trava de status do envio de mensagem: o INSERT só acontece se o ticket casar.
  const id = crypto.randomUUID()
  await prisma.feedback
    .update({
      where: { id: input.feedbackId, status: { in: OPEN_STATUSES } },
      data: {
        attachments: {
          create: {
            id,
            messageId: input.messageId,
            url: input.path,
            mimeType: input.mimeType,
            filename: input.filename,
            size: input.size,
            uploadedById: input.actor.id,
            uploadedByParty: input.party,
          },
        },
      },
      select: { id: true },
    })
    .catch((err) => rethrowAs(err, threadClosedError()))

  return { id }
}

/**
 * Exclui uma imagem do ticket e devolve o caminho no Storage, para a rota apagar o objeto.
 * Quem enviou remove a própria imagem enquanto o ticket está aberto; o admin global remove
 * qualquer uma a qualquer momento (moderação — o upload é aberto a qualquer autenticado).
 */
export async function deleteAttachment(
  feedbackId: string,
  attachmentId: string,
  actor: ThreadActor,
): Promise<{ path: string }> {
  const att = await prisma.feedbackAttachment.findFirst({
    where: { id: attachmentId, feedbackId },
    select: { id: true, url: true, uploadedById: true, feedback: { select: { status: true } } },
  })
  if (!att) {
    throw new NotFoundError("Imagem não encontrada", ERROR_CODES.feedbackAttachmentNotFound)
  }

  if (!actor.isSystemAdmin) {
    if (att.uploadedById !== actor.id) {
      throw new ForbiddenError(
        "Você só pode excluir imagens que enviou",
        ERROR_CODES.mediaDeleteNotUploader,
      )
    }
    if (!isThreadOpen(att.feedback.status)) throw threadClosedError()
  }

  await prisma.feedbackAttachment.delete({ where: { id: attachmentId } })
  return { path: att.url }
}
