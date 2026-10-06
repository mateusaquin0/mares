// MARES — Hooks de Feedback (react-query): envio pelo usuário e gestão pelo admin.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { feedbackService } from "@/services/feedback"
import { pendingCountsKeys } from "@/hooks/use-pending-counts"
import type { CreateFeedbackData, UpdateMyFeedbackData } from "@/schemas/feedback.schema"
import type { FeedbackStatus } from "@/types/feedback"

export const feedbackKeys = {
  list: (status?: string) => ["feedback", status ?? "all"] as const,
  mine: () => ["feedback", "mine"] as const,
  thread: (id: string) => ["feedback", "thread", id] as const,
}

// Depois de mexer numa conversa, as duas listas mudam (contador de mensagens, indicador de
// não lida) e a bolinha do menu também.
function invalidateFeedback(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ["feedback"] })
  qc.invalidateQueries({ queryKey: pendingCountsKeys.all })
  if (id) qc.invalidateQueries({ queryKey: feedbackKeys.thread(id) })
}

// Envio (qualquer usuário autenticado), com as imagens do relato.
// As imagens vão DEPOIS do POST: elas precisam do id do ticket para serem registradas.
// Uma falha de upload não desfaz o relato — ele já foi enviado —, então o número de
// imagens que não subiram volta junto para a UI avisar sem alarmar.
export function useCreateFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ files, ...data }: CreateFeedbackData & { files?: File[] }) => {
      const created = await feedbackService.create(data)
      let failedUploads = 0
      for (const file of files ?? []) {
        try {
          await feedbackService.uploadAttachment(created.id, file)
        } catch {
          failedUploads += 1
        }
      }
      return { ...created, failedUploads }
    },
    onSuccess: () => invalidateFeedback(qc),
  })
}

// Envios do próprio usuário (acompanhar status e resposta da administração).
export function useMyFeedback() {
  return useQuery({
    queryKey: feedbackKeys.mine(),
    queryFn: () => feedbackService.listMine(),
    // Lista é pano de fundo: ninguém fica encarando esperando resposta, e a consulta é mais
    // cara (todos os tickets + contagens + a última mensagem de cada um). 60s dá conta de
    // ticket novo e de bolinha de não-lido; o caso comum — voltar para a aba — é coberto
    // pelo refetch no foco. A conversa ABERTA é que corre a 10s.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
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
    // Lista é pano de fundo: ninguém fica encarando esperando resposta, e a consulta é mais
    // cara (todos os tickets + contagens + a última mensagem de cada um). 60s dá conta de
    // ticket novo e de bolinha de não-lido; o caso comum — voltar para a aba — é coberto
    // pelo refetch no foco. A conversa ABERTA é que corre a 10s.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
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
    // Lista mudou + a bolinha de pendências do menu (feedback a triar) precisa atualizar.
    onSuccess: (_res, { id }) => invalidateFeedback(qc, id),
  })
}

// ── Conversa do ticket ──────────────────────────────────────────────────────
// `enabled` deixa o chamador buscar a conversa só quando o modal do ticket está aberto.
export function useFeedbackThread(id: string | null) {
  return useQuery({
    queryKey: feedbackKeys.thread(id ?? ""),
    queryFn: () => feedbackService.thread(id!),
    enabled: !!id,
    // Esta é a única tela em que o OUTRO lado escreve enquanto você olha, então aqui os
    // padrões do app (staleTime de 1 min e refetchOnWindowFocus desligado, em providers.tsx)
    // são invertidos. O polling só existe enquanto o diálogo está aberto — `enabled` o liga
    // e desliga junto — e não roda em aba oculta (`refetchIntervalInBackground` é false).
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  })
}

export function useSendFeedbackMessage(id: string) {
  const qc = useQueryClient()
  return useMutation({
    // As imagens vão depois da mensagem: o anexo precisa do id dela para aparecer no balão
    // certo. Uma falha de upload NÃO derruba a mutation — a mensagem já está publicada, e
    // deixá-la falhar esconderia do autor a mensagem que ele acabou de mandar.
    mutationFn: async ({ body, files }: { body: string; files?: File[] }) => {
      const message = await feedbackService.sendMessage(id, body)
      let failedUploads = 0
      for (const file of files ?? []) {
        try {
          await feedbackService.uploadAttachment(id, file, message.id)
        } catch {
          failedUploads += 1
        }
      }
      return { ...message, failedUploads }
    },
    onSuccess: () => invalidateFeedback(qc, id),
  })
}

// Marca a conversa como lida por quem está vendo (some o indicador de mensagem nova).
export function useMarkThreadRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => feedbackService.markThreadRead(id),
    onSuccess: () => invalidateFeedback(qc),
  })
}

export function useRemoveFeedbackAttachment(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => feedbackService.removeAttachment(id, attachmentId),
    onSuccess: () => invalidateFeedback(qc, id),
  })
}

// Reabertura de um ticket encerrado, pedida pelo autor.
export function useReopenMyFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      feedbackService.reopenMine(id, reason),
    onSuccess: (_res, { id }) => invalidateFeedback(qc, id),
  })
}
