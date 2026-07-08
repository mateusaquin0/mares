// MARES — Serviço de Feedback (client). Envio pelo usuário e gestão pelo admin global.

import { http } from "@/lib/http"
import type { CreateFeedbackData } from "@/schemas/feedback.schema"
import type { FeedbackItem, FeedbackStatus } from "@/types/feedback"

export const feedbackService = {
  create: (data: CreateFeedbackData) => http.post("/api/feedback", data),
  list: (status?: string) =>
    http.get<FeedbackItem[]>("/api/feedback", { params: status ? { status } : undefined }),
  update: (id: string, data: { status?: FeedbackStatus; adminNote?: string | null }) =>
    http.patch(`/api/feedback/${id}`, data),
}
