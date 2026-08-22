"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useErrorMessage } from "@/lib/use-error-message"
import { useRemoveFeedbackAttachment, useSendFeedbackMessage } from "@/hooks/use-feedback"
import { FEEDBACK_MESSAGE_BODY_MAX } from "@/schemas/feedback.schema"
import { FEEDBACK_ATTACHMENT_MAX_PER_TICKET } from "@/lib/feedback-media"
import { FeedbackImagePicker, FeedbackImagePreviews } from "@/components/feedback-image-picker"
import type {
  FeedbackAttachment,
  FeedbackParty,
  FeedbackThread,
  FeedbackThreadSummary,
} from "@/types/feedback"
import type { FeedbackNamespace } from "@/components/feedback-badges"

/** Total de imagens do ticket (relato + conversa) — o teto vale para o ticket inteiro. */
export function countAttachments(thread: FeedbackThread) {
  return (
    thread.reportAttachments.length +
    thread.messages.reduce((sum, m) => sum + m.attachments.length, 0)
  )
}

/** Todas as imagens do ticket, na ordem em que apareceram (para o painel de anexos). */
export function allAttachments(thread: FeedbackThread): FeedbackAttachment[] {
  return [...thread.reportAttachments, ...thread.messages.flatMap((m) => m.attachments)]
}

/**
 * Quem pode apagar um anexo: enquanto a conversa está aberta, cada lado tira o que ele mesmo
 * pôs; a administração ainda modera qualquer imagem. O servidor confirma as duas regras — isto
 * aqui só decide se o botão aparece. Exportada porque o dossiê e os balões usam a mesma regra.
 */
export function canRemoveAttachment(thread: FeedbackThread, a: FeedbackAttachment) {
  if (thread.party === "ADMIN") return true
  return thread.open && a.uploadedByParty === thread.party
}

/**
 * Miniatura de uma imagem anexada, para a CONVERSA: só a imagem e a lixeira. O nome não
 * aparece aqui — dentro do balão ele rouba a atenção do que foi escrito, e a lista completa
 * com nomes já está no painel de anexos do dossiê. Ele vira `title`/`alt`.
 */
export function AttachmentThumb({
  attachment,
  onRemove,
  removing,
  removeLabel,
}: {
  attachment: FeedbackAttachment
  onRemove?: () => void
  removing?: boolean
  removeLabel: string
}) {
  return (
    <span className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
      {attachment.url ? (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          title={attachment.filename}
          className="block size-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.filename}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </a>
      ) : (
        <span
          title={attachment.filename}
          className="grid size-full place-items-center p-1 text-center text-[10px] text-muted-foreground"
        >
          {attachment.filename}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          title={removeLabel}
          className="absolute right-1 top-1 rounded-md bg-background/85 p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          <span className="sr-only">{removeLabel}</span>
        </button>
      )}
    </span>
  )
}

/**
 * Chip de uma imagem anexada. O bucket é privado: `url` é assinada e temporária, e pode vir
 * nula se o Storage falhar ao assinar — aí resta o nome do arquivo, sem link.
 */
export function AttachmentChip({
  attachment,
  onRemove,
  removing,
  removeLabel,
}: {
  attachment: FeedbackAttachment
  onRemove?: () => void
  removing?: boolean
  removeLabel: string
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-muted/60 py-1 pl-1.5 pr-2 text-xs">
      {/* A miniatura é o próprio arquivo: a URL assinada já foi gerada para o link, então
          mostrá-la não custa nada a mais no servidor. `lazy` evita baixar as imagens que
          ainda estão fora da vista — o arquivo vem em tamanho original (o Storage só
          redimensiona em plano pago), e quem encolhe é o CSS. */}
      {attachment.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-8 shrink-0 rounded bg-background/70 object-cover"
        />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded bg-background/70 text-muted-foreground">
          <ImageIcon className="size-3.5" aria-hidden />
        </span>
      )}
      {attachment.url ? (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          title={attachment.filename}
          className="min-w-0 flex-1 truncate font-medium text-foreground/80 underline-offset-4 hover:text-accent-foreground hover:underline"
        >
          {attachment.filename}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{attachment.filename}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          title={removeLabel}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          <span className="sr-only">{removeLabel}</span>
        </button>
      )}
    </span>
  )
}

// Rascunho da correção do relato pelo autor — vive no diálogo (o título fica no cabeçalho e
// a mensagem no corpo, mas os dois são salvos juntos).
export type ThreadEditState = {
  active: boolean
  message: string
  onMessage: (v: string) => void
  save: () => void
  cancel: () => void
  saving: boolean
  canSave: boolean
}

/**
 * Coluna da direita do diálogo de ticket: descrição original, conversa e a caixa de escrita
 * (ou a barra de conversa encerrada). O componente NÃO busca a thread — quem a carrega é o
 * diálogo, que também a usa na coluna do dossiê.
 */
export function FeedbackThreadPane({
  feedbackId,
  thread,
  ns,
  reportMessage,
  authorMeta,
  edit,
  canEdit,
  editLockNote,
  onStartEdit,
  onReopen,
}: {
  feedbackId: string
  thread: FeedbackThread
  ns: FeedbackNamespace
  // Relato original, como está salvo (a thread só carrega o que veio DEPOIS dele).
  reportMessage: string
  // "marina@… · 21/08/2026, 22:33" — quem abriu o ticket e quando.
  authorMeta: string
  edit?: ThreadEditState
  canEdit?: boolean
  editLockNote?: string
  onStartEdit?: () => void
  // Só o autor, e só com o ticket encerrado.
  onReopen?: () => void
}) {
  const t = useTranslations(ns)
  const locale = useLocale()
  const em = useErrorMessage()

  const sendM = useSendFeedbackMessage(feedbackId)
  const removeM = useRemoveFeedbackAttachment(feedbackId)

  const [body, setBody] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  // Mantém a última mensagem à vista quando a conversa cresce.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [thread.messages.length])

  const remaining = Math.max(
    0,
    FEEDBACK_ATTACHMENT_MAX_PER_TICKET - countAttachments(thread) - files.length,
  )
  const canSend = !!body.trim() && !sendM.isPending

  async function submit() {
    if (!canSend) return
    try {
      const { failedUploads } = await sendM.mutateAsync({ body: body.trim(), files })
      setBody("")
      setFiles([])
      // A mensagem foi publicada mesmo que alguma imagem não suba: avisa sem sugerir que o
      // envio falhou.
      if (failedUploads > 0) toast.warning(t("attachError"))
    } catch (err) {
      toast.error(t("messageError"), { description: em(err) })
    }
  }

  async function removeAttachment(id: string) {
    try {
      await removeM.mutateAsync(id)
    } catch (err) {
      toast.error(t("messageError"), { description: em(err) })
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale)

  // Rótulo de quem escreveu: o próprio lado vira "Você"; do outro lado, o nome (e o e-mail
  // como reserva) quando são visíveis — a administração vê quem é o autor; o autor não vê
  // quem tria.
  function partyLabel(party: FeedbackParty, name: string | null, email: string | null) {
    if (party === thread.party) return t("partyYou")
    if (party === "ADMIN") return t("partyAdmin")
    return name || email || t("partyAuthor")
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-card">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        {/* Descrição original: o relato como ele foi escrito, destacado do diálogo que veio
            depois. É o único bloco que o autor pode corrigir, e só enquanto está NEW. */}
        <section className="rounded-xl border border-l-[3px] border-l-[hsl(var(--brand-cyan))] bg-muted/30 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.09em] text-accent-foreground">
              {t("originalDescription")}
            </h4>
            {canEdit && !edit?.active && onStartEdit && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onStartEdit}>
                <Pencil className="size-3" />
                {t("edit")}
              </Button>
            )}
          </div>

          {edit?.active ? (
            <div className="space-y-2">
              <Textarea
                value={edit.message}
                onChange={(e) => edit.onMessage(e.target.value)}
                rows={5}
                aria-label={t("messageLabel")}
                className="bg-card"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{authorMeta}</span>
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" size="sm" onClick={edit.cancel} disabled={edit.saving}>
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={edit.save}
                    loading={edit.saving}
                    disabled={!edit.canSave}
                  >
                    {t("save")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {reportMessage}
              </p>
              <p className="mt-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {authorMeta}
              </p>
              {thread.reportAttachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {thread.reportAttachments.map((a) => (
                    <AttachmentThumb
                      key={a.id}
                      attachment={a}
                      removeLabel={t("removeAttachment")}
                      removing={removeM.isPending}
                      onRemove={
                        canRemoveAttachment(thread, a) ? () => removeAttachment(a.id) : undefined
                      }
                    />
                  ))}
                </div>
              )}
              {editLockNote && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3 shrink-0" aria-hidden />
                  {editLockNote}
                </p>
              )}
            </>
          )}
        </section>

        {thread.messages.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <MessageSquare className="size-4 shrink-0" aria-hidden />
            {t("threadEmpty")}
          </p>
        ) : (
          thread.messages.map((m) => {
            const mine = m.party === thread.party
            return (
              <div key={m.id} className={cn("flex flex-col gap-1.5", mine && "items-end")}>
                <div
                  className={cn(
                    "max-w-[78%] px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]",
                    mine
                      ? "rounded-xl rounded-br-sm bg-accent text-accent-foreground"
                      : "rounded-xl rounded-bl-sm border bg-muted/60",
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
                {m.attachments.length > 0 && (
                  <div className={cn("flex max-w-[78%] flex-wrap gap-2", mine && "justify-end")}>
                    {m.attachments.map((a) => (
                      <AttachmentThumb
                        key={a.id}
                        attachment={a}
                        removeLabel={t("removeAttachment")}
                        removing={removeM.isPending}
                        onRemove={
                          canRemoveAttachment(thread, a) ? () => removeAttachment(a.id) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                  {partyLabel(m.party, m.createdByName, m.createdByEmail)} · {fmtDate(m.createdAt)}
                </span>
              </div>
            )
          })
        )}

        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t bg-muted/30 p-4">
        {thread.open ? (
          <div className="space-y-2.5">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("messagePlaceholder")}
              maxLength={FEEDBACK_MESSAGE_BODY_MAX}
              rows={3}
              aria-label={t("threadTitle")}
              className="bg-card"
            />
            <FeedbackImagePreviews files={files} onChange={setFiles} ns={ns} />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <FeedbackImagePicker
                files={files}
                onChange={setFiles}
                remaining={remaining}
                ns={ns}
                disabled={sendM.isPending}
              />
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {body.trim().length}/{FEEDBACK_MESSAGE_BODY_MAX}
                </span>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={submit}
                  loading={sendM.isPending}
                  disabled={!canSend}
                >
                  <Send className="size-4" />
                  {t("send")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden />
              {t(thread.status === "RESOLVED" ? "lockedResolved" : "lockedDismissed")}
            </p>
            {onReopen && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onReopen}>
                <RotateCcw className="size-3.5" />
                {t("reopen")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Resumo da conversa numa linha de tabela: nº de mensagens, clipe quando há imagem e a
 * bolinha de "tem mensagem nova do outro lado" — o `unread` já vem calculado pelo servidor
 * na perspectiva de quem pediu a lista.
 */
export function ThreadSummaryCell({
  summary,
  ns,
}: {
  summary: FeedbackThreadSummary
  ns: FeedbackNamespace
}) {
  const t = useTranslations(ns)
  if (!summary.messageCount && !summary.attachmentCount) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {summary.messageCount > 0 && (
        <span className="inline-flex items-center gap-1" title={t("threadTitle")}>
          <MessageSquare className="size-3.5" aria-hidden />
          {summary.messageCount}
        </span>
      )}
      {summary.attachmentCount > 0 && (
        <span className="inline-flex items-center gap-1" title={t("sectionAttachments")}>
          <Paperclip className="size-3.5" aria-hidden />
          {summary.attachmentCount}
        </span>
      )}
      {/* Depois dos contadores: aparecendo e sumindo à esquerda, a bolinha empurrava os
          ícones e eles deixavam de alinhar entre as linhas. */}
      {summary.unread && (
        <span
          role="status"
          aria-label={t("unreadReply")}
          title={t("unreadReply")}
          className="size-2 shrink-0 rounded-full bg-orange-500"
        />
      )}
    </span>
  )
}
