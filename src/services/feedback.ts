// MARES — Serviço de Feedback (client). Envio pelo usuário e gestão pelo admin global.

import { http } from "@/lib/http"
import type { CreateFeedbackData, UpdateMyFeedbackData } from "@/schemas/feedback.schema"
import type {
  FeedbackItem,
  FeedbackMessage,
  FeedbackStatus,
  FeedbackThread,
  MyFeedbackItem,
} from "@/types/feedback"

export const feedbackService = {
  create: (data: CreateFeedbackData) => http.post<{ id: string }>("/api/feedback", data),
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

  // Reabertura de um ticket encerrado, pedida pelo autor (a justificativa vira a primeira
  // mensagem da conversa reaberta).
  reopenMine: (id: string, reason: string) =>
    http.post<{ id: string; status: FeedbackStatus }>(`/api/feedback/mine/${id}/reopen`, {
      reason,
    }),

  // ── Conversa do ticket ────────────────────────────────────────────────────
  // As mesmas rotas servem ao autor e à administração: o servidor resolve o lado de quem
  // chamou (ver src/lib/feedback.ts → loadThreadAccess).
  thread: (id: string) => http.get<FeedbackThread>(`/api/feedback/${id}/thread`),
  sendMessage: (id: string, body: string) =>
    http.post<FeedbackMessage>(`/api/feedback/${id}/thread`, { body }),
  markThreadRead: (id: string) => http.patch<{ ok: true }>(`/api/feedback/${id}/thread`),

  // Anexos de imagem. `messageId` vazio = imagem do relato original.
  uploadAttachment: (id: string, file: File, messageId?: string) => {
    const form = new FormData()
    form.append("file", file)
    if (messageId) form.append("messageId", messageId)
    return http.postForm<{ id: string }>(`/api/feedback/${id}/attachments`, form)
  },
  removeAttachment: (id: string, attachmentId: string) =>
    http.del(`/api/feedback/${id}/attachments/${attachmentId}`),
}
