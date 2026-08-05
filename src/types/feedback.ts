import type { FeedbackType, FeedbackStatus } from "@prisma/client"

export type { FeedbackType, FeedbackStatus }

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
  orgId: string | null
  createdAt: string
  updatedAt: string
}

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
}
