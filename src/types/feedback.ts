import type { FeedbackType, FeedbackStatus, FeedbackParty } from "@prisma/client"

export type { FeedbackType, FeedbackStatus, FeedbackParty }

// Resumo da conversa que acompanha cada linha das duas listas. `unread` já vem calculado
// na perspectiva de quem pediu a lista (autor numa, administração na outra).
export type FeedbackThreadSummary = {
  messageCount: number
  attachmentCount: number
  lastMessageAt: string | null
  unread: boolean
}

// Imagem anexada ao ticket. `url` é uma URL assinada temporária (bucket privado) — nunca
// um caminho estável: não guarde nem compartilhe.
export type FeedbackAttachment = {
  id: string
  messageId: string | null
  url: string | null
  mimeType: string
  filename: string
  size: number
  uploadedById: string | null
  uploadedByParty: FeedbackParty
  createdAt: string
}

export type FeedbackMessage = {
  id: string
  body: string
  party: FeedbackParty
  // Os dois voltam `null` nas mensagens da administração vistas pelo autor (a identidade de
  // quem tria não sai para ele).
  createdByName: string | null
  createdByEmail: string | null
  createdAt: string
  attachments: FeedbackAttachment[]
}

// Conversa completa de um ticket, como devolvida por GET /api/feedback/:id/thread.
export type FeedbackThread = {
  status: FeedbackStatus
  // Lado de quem está lendo — a UI alinha os balões e rotula o autor a partir daqui.
  party: FeedbackParty
  // A conversa só aceita mensagens enquanto o ticket está aberto.
  open: boolean
  reportAttachments: FeedbackAttachment[]
  messages: FeedbackMessage[]
}

// Item de feedback como devolvido pela API admin (datas em ISO string).
export type FeedbackItem = {
  id: string
  type: FeedbackType
  title: string
  message: string
  pageUrl: string | null
  status: FeedbackStatus
  adminNote: string | null
  // Resposta ao autor (visível para ele); obrigatória quando o status é WONT_FIX.
  resolutionNote: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdById: string | null
  createdByEmail: string
  // Nome vivo do autor (o ticket guarda só o snapshot do e-mail); `null` se o usuário foi
  // removido ou nunca preencheu o nome.
  createdByName: string | null
  orgId: string | null
  createdAt: string
  updatedAt: string
} & FeedbackThreadSummary

// Item como devolvido em /api/feedback/mine: o que o próprio autor pode ver. Sem
// `adminNote` — o recorte é feito no servidor (src/lib/feedback.ts → mineSelect).
export type MyFeedbackItem = {
  id: string
  type: FeedbackType
  title: string
  message: string
  pageUrl: string | null
  status: FeedbackStatus
  resolutionNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
} & FeedbackThreadSummary
