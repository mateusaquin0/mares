// MARES — Hooks de Feedback (react-query): envio pelo usuário e gestão pelo admin.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { feedbackService } from "@/services/feedback"
import { pendingCountsKeys } from "@/hooks/use-pending-counts"
import type { CreateFeedbackData, UpdateMyFeedbackData } from "@/schemas/feedback.schema"
import type { FeedbackStatus } from "@/types/feedback"

export const feedbackKeys = {
  list: (status?: string) => ["feedback", status ?? "all"] as const,
  mine: () => ["feedback", "mine"] as const,
}

// Envio (qualquer usuário autenticado).
export function useCreateFeedback() {
  return useMutation({
    mutationFn: (data: CreateFeedbackData) => feedbackService.create(data),
  })
}

// Envios do próprio usuário (acompanhar status e resposta da administração).
export function useMyFeedback() {
  return useQuery({
    queryKey: feedbackKeys.mine(),
    queryFn: () => feedbackService.listMine(),
  })
}

// Correção pelo autor (só enquanto o feedback está NEW).
export function useUpdateMyFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMyFeedbackData) =>
      feedbackService.updateMine(id, data),
    // Invalida "meus envios" e, se o admin estiver com a fila aberta, também a lista dele.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  })
}

// Lista (admin global).
export function useFeedbackList(status?: string) {
  return useQuery({
    queryKey: feedbackKeys.list(status),
    queryFn: () => feedbackService.list(status),
  })
}

// Triagem (admin global): muda status, anota internamente e/ou responde ao autor.
export function useUpdateFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      status?: FeedbackStatus
      adminNote?: string | null
      resolutionNote?: string | null
    }) => feedbackService.update(id, data),
    // Lista mudou + a bolinha de pendências do menu (feedback NEW) precisa atualizar.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback"] })
      qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
    },
  })
}
