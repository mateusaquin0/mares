"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Image as ImageIcon,
  Lock,
  MessageSquare,
  MessageSquareDot,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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
  asRow = false,
}: {
  attachment: FeedbackAttachment
  onRemove?: () => void
  removing?: boolean
  removeLabel: string
  // Linha de lista (coluna de detalhes do ticket) em vez de etiqueta.
  asRow?: boolean
}) {
  return (
    <span
      className={cn(
        asRow
          ? "flex w-full items-center gap-2 border-b border-border py-[5px]"
          : "inline-flex max-w-full items-center gap-2 rounded-lg border bg-muted/60 py-1 pl-1.5 pr-2 text-xs",
      )}
    >
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
          className={cn(
            "shrink-0 object-cover",
            asRow ? "size-7 border border-border bg-muted" : "size-8 rounded bg-background/70",
          )}
        />
      ) : (
        <span
          className={cn(
            "grid shrink-0 place-items-center text-muted-foreground",
            asRow ? "size-7 border border-border bg-muted" : "size-8 rounded bg-background/70",
          )}
        >
          <ImageIcon className="size-3.5" aria-hidden />
        </span>
      )}
      {attachment.url ? (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          title={attachment.filename}
          className={cn(
            "min-w-0 flex-1 truncate",
            asRow
              ? "underline underline-offset-2 hover:text-primary"
              : "font-medium text-foreground/80 underline-offset-4 hover:text-accent-foreground hover:underline",
          )}
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
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-3">
        {/* Descrição original: o relato como ele foi escrito, destacado do diálogo que veio
            depois. É o único bloco que o autor pode corrigir, e só enquanto está NEW. */}
        <section className="border border-l-2 border-border border-l-foreground px-3 pb-2.5 pt-2">
          <div className="flex min-h-[26px] items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {t("originalDescription")}
            </h4>
            {canEdit && !edit?.active && onStartEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-[26px] gap-1.5"
                onClick={onStartEdit}
              >
                <Pencil className="size-3" />
                {t("edit")}
              </Button>
            )}
          </div>

          {edit?.active ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                value={edit.message}
                onChange={(e) => edit.onMessage(e.target.value)}
                rows={5}
                aria-label={t("messageLabel")}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-muted-foreground">{authorMeta}</span>
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
              <p className="mt-1 whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]">
                {reportMessage}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                {authorMeta}
              </p>
              {thread.reportAttachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
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
                <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  {editLockNote}
                </p>
              )}
            </>
          )}
        </section>

        {thread.messages.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-muted-foreground">
            <MessageSquare className="size-4 shrink-0" aria-hidden />
            {t("threadEmpty")}
          </p>
        ) : (
          thread.messages.map((m) => {
            const mine = m.party === thread.party
            // Cada lado da conversa fica num lado da coluna: quem lê à direita, com o fundo de
            // destaque; o outro lado à esquerda, com borda e fundo neutro.
            return (
              <div
                key={m.id}
                className={cn("mt-3 flex flex-col gap-1", mine ? "items-end" : "items-start")}
              >
                <p
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap rounded-sm px-3 py-2 text-pretty [overflow-wrap:anywhere]",
                    mine
                      ? "bg-accent text-accent-foreground"
                      : "border border-border bg-muted text-foreground",
                  )}
                >
                  {m.body}
                </p>
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
                <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                  <b className="font-semibold text-foreground">
                    {partyLabel(m.party, m.createdByName, m.createdByEmail)}
                  </b>
                  <span>{fmtDate(m.createdAt)}</span>
                </p>
              </div>
            )
          })
        )}

        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-foreground bg-background px-5 pb-3 pt-2.5">
        {thread.open ? (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("messagePlaceholder")}
              maxLength={FEEDBACK_MESSAGE_BODY_MAX}
              rows={2}
              aria-label={t("threadTitle")}
              className="bg-popover"
            />
            <FeedbackImagePreviews files={files} onChange={setFiles} ns={ns} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <FeedbackImagePicker
                files={files}
                onChange={setFiles}
                remaining={remaining}
                ns={ns}
                disabled={sendM.isPending}
              />
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {body.trim().length}/{FEEDBACK_MESSAGE_BODY_MAX}
                </span>
                <Button
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
            <p className="flex items-center gap-2 text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden />
              {t(thread.status === "RESOLVED" ? "lockedResolved" : "lockedDismissed")}
            </p>
            {onReopen && (
              <Button variant="outline" className="gap-1.5" onClick={onReopen}>
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
  // Resposta não lida tem prioridade: é o que a pessoa precisa ver na lista.
  if (summary.unread) {
    return (
      <Badge variant="info" role="status" aria-label={t("unreadReply")} title={t("unreadReply")}>
        <MessageSquareDot aria-hidden />
        <span className="truncate">{t("unreadReply")}</span>
      </Badge>
    )
  }
  if (!summary.messageCount && !summary.attachmentCount) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="inline-flex items-center gap-2.5 text-muted-foreground">
      {summary.messageCount > 0 && (
        <span title={t("threadTitle")}>{t("messageCount", { count: summary.messageCount })}</span>
      )}
      {summary.attachmentCount > 0 && (
        <span className="inline-flex items-center gap-1" title={t("sectionAttachments")}>
          <Paperclip className="size-3.5" aria-hidden />
          {summary.attachmentCount}
        </span>
      )}
    </span>
  )
}
