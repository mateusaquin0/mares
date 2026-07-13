// MARES — Hooks de Feedback (react-query): envio pelo usuário e gestão pelo admin.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { feedbackService } from "@/services/feedback"
import { pendingCountsKeys } from "@/hooks/use-pending-counts"
import type { CreateFeedbackData } from "@/schemas/feedback.schema"
import type { FeedbackStatus } from "@/types/feedback"

export const feedbackKeys = {
  list: (status?: string) => ["feedback", status ?? "all"] as const,
}

// Envio (qualquer usuário autenticado).
export function useCreateFeedback() {
  return useMutation({
    mutationFn: (data: CreateFeedbackData) => feedbackService.create(data),
  })
}

// Lista (admin global).
export function useFeedbackList(status?: string) {
  return useQuery({
    queryKey: feedbackKeys.list(status),
    queryFn: () => feedbackService.list(status),
  })
}

// Triagem (admin global): muda status / anota.
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
    }) => feedbackService.update(id, data),
    // Lista mudou + a bolinha de pendências do menu (feedback NEW) precisa atualizar.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback"] })
      qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
    },
  })
}
