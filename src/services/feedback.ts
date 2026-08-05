// MARES — Serviço de Feedback (client). Envio pelo usuário e gestão pelo admin global.

import { http } from "@/lib/http"
import type { CreateFeedbackData, UpdateMyFeedbackData } from "@/schemas/feedback.schema"
import type { FeedbackItem, FeedbackStatus, MyFeedbackItem } from "@/types/feedback"

export const feedbackService = {
  create: (data: CreateFeedbackData) => http.post("/api/feedback", data),
  // Envios do próprio usuário (qualquer autenticado).
  listMine: () => http.get<MyFeedbackItem[]>("/api/feedback/mine"),
  // Correção pelo autor, só enquanto o feedback está NEW.
  updateMine: (id: string, data: UpdateMyFeedbackData) =>
    http.patch<MyFeedbackItem>(`/api/feedback/mine/${id}`, data),
  list: (status?: string) =>
    http.get<FeedbackItem[]>("/api/feedback", { params: status ? { status } : undefined }),
  update: (
    id: string,
    data: { status?: FeedbackStatus; adminNote?: string | null; resolutionNote?: string | null },
  ) => http.patch(`/api/feedback/${id}`, data),
}
