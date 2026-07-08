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
  createdById: string | null
  createdByEmail: string
  orgId: string | null
  createdAt: string
  updatedAt: string
}
