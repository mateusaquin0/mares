"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Bug,
  Check,
  ChevronDown,
  Clock,
  EyeOff,
  Lightbulb,
  Link2,
  Tag,
  User,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  useFeedbackThread,
  useMarkThreadRead,
  useRemoveFeedbackAttachment,
} from "@/hooks/use-feedback"
import { useErrorMessage } from "@/lib/use-error-message"
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_RESOLUTION_MAX,
  FEEDBACK_RESOLUTION_MIN,
  FEEDBACK_TITLE_MAX,
  type FeedbackTypeValue,
} from "@/schemas/feedback.schema"
import {
  FEEDBACK_STATUS_META,
  FeedbackStatusBadge,
  FeedbackTypeBadge,
} from "@/components/feedback-badges"
import type { FeedbackNamespace } from "@/components/feedback-badges"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AttachmentChip,
  FeedbackThreadPane,
  allAttachments,
  canRemoveAttachment,
} from "@/components/feedback-thread"
import type { FeedbackStatus, FeedbackType } from "@/types/feedback"
import { EmptyState } from "@/components/ui/empty-state"

// Status que a triagem GRAVA. `REOPENED` fica de fora: ele é o pedido do autor, e a
// administração sai dele triando (o servidor recusa gravá-lo).
const SETTABLE: FeedbackStatus[] = ["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX"]

// O ticket como as duas telas o entregam. A visão do autor não tem `adminNote` nem o e-mail
// do autor (é ele mesmo) — o recorte já veio do servidor, aqui só chega `null`.
export type TicketDialogData = {
  id: string
  type: FeedbackType
  title: string
  message: string
  pageUrl: string | null
  status: FeedbackStatus
  resolutionNote: string | null
  reviewedAt: string | null
  createdAt: string
  // Nome e e-mail de quem abriu. Na visão do autor os dois são `null` (é ele mesmo) e o
  // cabeçalho diz "Você".
  authorName: string | null
  authorEmail: string | null
  adminNote: string | null
}

export type TicketAdminActions = {
  onSetStatus: (status: FeedbackStatus) => Promise<void>
  onDiscard: (note: string) => Promise<void>
  busy: boolean
}

export type TicketAuthorActions = {
  onSaveEdit: (draft: { type: FeedbackTypeValue; title: string; message: string }) => Promise<void>
  onReopen: () => void
  saving: boolean
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={cn(
        "border-b border-foreground pb-1 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </h3>
  )
}

/**
 * Diálogo de um ticket de feedback, em duas colunas: o **dossiê** à esquerda (triagem,
 * detalhes, anexos) e a **conversa** à direita. É o mesmo diálogo nas duas telas — quem
 * muda é o conjunto de ações recebido (`admin` ou `author`) e o lado que o servidor resolve
 * na thread. Segue o artboard "Duas colunas" do Claude Design.
 */
export function FeedbackTicketDialog({
  ticket,
  ns,
  open,
  onOpenChange,
  admin,
  author,
  openDiscard,
}: {
  ticket: TicketDialogData | null
  ns: FeedbackNamespace
  open: boolean
  onOpenChange: (open: boolean) => void
  admin?: TicketAdminActions
  author?: TicketAuthorActions
  // Abre já com a caixa de descarte: é o caminho do menu "Descartar" da fila de triagem,
  // que precisa cair na justificativa obrigatória em vez de aplicar o status direto.
  openDiscard?: boolean
}) {
  const t = useTranslations(ns)
  const tc = useTranslations("common")
  const locale = useLocale()

  const em = useErrorMessage()
  const threadQ = useFeedbackThread(open && ticket ? ticket.id : null)
  const thread = threadQ.data
  const markReadM = useMarkThreadRead()
  // O painel de anexos apaga a imagem de verdade (o mesmo endpoint dos balões).
  const removeM = useRemoveFeedbackAttachment(ticket?.id ?? "")

  async function removeAttachment(id: string) {
    try {
      await removeM.mutateAsync(id)
    } catch (err) {
      toast.error(t("messageError"), { description: em(err) })
    }
  }

  // Correção do relato pelo autor: título e tipo moram no cabeçalho, a mensagem no corpo,
  // mas os três são salvos juntos — por isso o rascunho vive aqui, e não no painel.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{
    type: FeedbackTypeValue
    title: string
    message: string
  }>({ type: "SUGGESTION", title: "", message: "" })

  // Descarte: exige justificativa, então abre uma caixa própria na coluna da triagem.
  const [discarding, setDiscarding] = useState(false)
  const [discardNote, setDiscardNote] = useState("")
  const discardTooShort = discardNote.trim().length < FEEDBACK_RESOLUTION_MIN

  // Abrir a conversa é lê-la: some o indicador de mensagem nova nas listas. A marcação se
  // repete quando CHEGA mensagem nova com o diálogo aberto — senão a lista acusaria novidade
  // para quem está justamente olhando para ela. O ref guarda ticket+última mensagem, para
  // não remarcar a cada re-render.
  const lastMessageId = thread?.messages.at(-1)?.id ?? null
  const markedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !ticket) {
      markedRef.current = null
      return
    }
    const seen = `${ticket.id}:${lastMessageId ?? ""}`
    if (markedRef.current === seen) return
    markedRef.current = seen
    markReadM.mutate(ticket.id)
    // markReadM muda de identidade a cada render; só o ticket e a última mensagem importam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id, lastMessageId])

  // Trocar de ticket (ou fechar) descarta rascunhos pela metade.
  useEffect(() => {
    setEditing(false)
    setDiscarding(!!openDiscard)
    setDiscardNote("")
  }, [ticket?.id, open, openDiscard])

  if (!ticket) return null

  const canEdit = !!author && ticket.status === "NEW"
  const canReopen = !!author && (ticket.status === "RESOLVED" || ticket.status === "WONT_FIX")
  const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale)

  function startEdit() {
    if (!ticket) return
    setDraft({ type: ticket.type, title: ticket.title, message: ticket.message })
    setEditing(true)
  }

  // Nos três handlers a falha é engolida DE PROPÓSITO: quem chama já mostrou o toast do
  // erro, e o rascunho continua aberto para a pessoa tentar de novo sem redigitar.
  async function saveEdit() {
    if (!author) return
    try {
      await author.onSaveEdit({
        type: draft.type,
        title: draft.title.trim(),
        message: draft.message.trim(),
      })
      setEditing(false)
    } catch {
      /* mantém o modo de edição */
    }
  }

  async function confirmDiscard() {
    if (!admin || discardTooShort) return
    try {
      await admin.onDiscard(discardNote.trim())
      setDiscarding(false)
      setDiscardNote("")
    } catch {
      /* mantém a caixa de descarte aberta */
    }
  }

  const detailFields: { key: string; icon: typeof Tag; label: string; value: string }[] = [
    {
      key: "type",
      icon: ticket.type === "BUG" ? Bug : Lightbulb,
      label: t("typeLabel"),
      value: t(ticket.type === "BUG" ? "typeBug" : "typeSuggestion"),
    },
    ...(ticket.authorEmail
      ? [{ key: "author", icon: User, label: t("detailAuthor"), value: ticket.authorEmail }]
      : []),
    { key: "opened", icon: Clock, label: t("fieldOpenedAt"), value: fmtDate(ticket.createdAt) },
    ...(ticket.pageUrl
      ? [{ key: "page", icon: Link2, label: t("detailPage"), value: ticket.pageUrl }]
      : []),
    ...(ticket.reviewedAt
      ? [
          {
            key: "triaged",
            icon: Tag,
            label: t("fieldTriagedAt"),
            value: fmtDate(ticket.reviewedAt),
          },
        ]
      : []),
  ]

  const attachments = thread ? allAttachments(thread) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90dvh] max-h-[740px] max-w-[1020px] gap-0 p-0" hideClose>
        {/* Duas colunas: o ticket à esquerda, status e fechar à direita — as duas linhas do
            topo têm a mesma altura (`min-h-8`, a do botão) para os quatro elementos ficarem
            na mesma linha ótica. */}
        <DialogHeader className="mx-0 shrink-0 space-y-0 px-5 pb-2.5 pt-3 text-left">
          <div className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-h-7 flex-wrap items-center gap-2">
                {editing ? (
                  // No modo de edição o badge de tipo vira o seletor: tipo, título e mensagem
                  // são salvos numa tacada só.
                  (["SUGGESTION", "BUG"] as const).map((value) => {
                    const Icon = value === "BUG" ? Bug : Lightbulb
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, type: value }))}
                        aria-pressed={draft.type === value}
                        className={cn(
                          "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[13px] transition-colors",
                          draft.type === value
                            ? "border-primary bg-muted font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                            : "border-input text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3" />
                        {t(value === "BUG" ? "typeBug" : "typeSuggestion")}
                      </button>
                    )
                  })
                ) : (
                  <FeedbackTypeBadge
                    type={ticket.type}
                    ns={ns}
                    className="border-input bg-transparent text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  />
                )}
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  #{ticket.id.slice(0, 8)}
                </span>
              </div>

              {editing ? (
                <>
                  {/* DialogTitle continua no DOM (acessibilidade), mas oculto no modo edição. */}
                  <DialogTitle className="sr-only">{ticket.title}</DialogTitle>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    maxLength={FEEDBACK_TITLE_MAX}
                    aria-label={t("titleLabel")}
                    className="text-base font-semibold"
                  />
                </>
              ) : (
                <DialogTitle className="mt-1 text-pretty [overflow-wrap:anywhere]">
                  {ticket.title}
                </DialogTitle>
              )}

              <DialogDescription className="text-[13px] [overflow-wrap:anywhere]">
                {t("openedBy", {
                  who: ticket.authorName ?? ticket.authorEmail ?? t("partyYou"),
                  date: fmtDate(ticket.createdAt),
                })}
              </DialogDescription>
            </div>

            <div className="flex min-h-7 shrink-0 items-center gap-2">
              {admin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={admin.busy}
                    className="inline-flex items-center gap-1 rounded-sm transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <FeedbackStatusBadge status={ticket.status} ns={ns} />
                    <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="sr-only">{t("moveTo")}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                      {t("moveTo")}
                    </DropdownMenuLabel>
                    {SETTABLE.map((s) => {
                      const current = ticket.status === s
                      return (
                        <DropdownMenuItem
                          key={s}
                          className="gap-2"
                          onSelect={() => {
                            if (current) return
                            // Descartar exige justificativa: abre a caixa em vez de gravar.
                            if (s === "WONT_FIX") {
                              setDiscardNote(ticket.resolutionNote ?? "")
                              setDiscarding(true)
                              return
                            }
                            admin.onSetStatus(s).catch(() => {})
                          }}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              FEEDBACK_STATUS_META[s].dot,
                            )}
                          />
                          <span className={cn(current && "font-semibold")}>{t(`status_${s}`)}</span>
                          {current && <Check className="ml-auto size-4" aria-hidden />}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <FeedbackStatusBadge status={ticket.status} ns={ns} />
              )}
              <DialogClose className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
                <span className="sr-only">{tc("close")}</span>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] border-t border-foreground">
          <aside className="flex min-h-0 flex-col gap-3.5 overflow-y-auto border-r border-border bg-background px-4 py-3">
            {/* O status é trocado pelo próprio badge do cabeçalho; aqui só sobra o que não
                cabe num menu — a justificativa obrigatória do descarte. */}
            {admin && discarding && (
              <section>
                <SectionLabel>{t("sectionStatus")}</SectionLabel>
                <div className="mt-2 space-y-1">
                  <Label htmlFor="discard-note">{t("discardReason")}</Label>
                  <Textarea
                    id="discard-note"
                    value={discardNote}
                    onChange={(e) => setDiscardNote(e.target.value)}
                    placeholder={t("resolutionPlaceholder")}
                    maxLength={FEEDBACK_RESOLUTION_MAX}
                    rows={4}
                    autoFocus
                  />
                  {discardTooShort && (
                    <p className="text-[13px] text-muted-foreground">
                      {t("resolutionMin", { min: FEEDBACK_RESOLUTION_MIN })}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={confirmDiscard}
                      loading={admin.busy}
                      disabled={discardTooShort}
                    >
                      {t("discardConfirm")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDiscarding(false)}
                      disabled={admin.busy}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            <section>
              <SectionLabel>{t("sectionDetails")}</SectionLabel>
              {detailFields.map(({ key, icon: Icon, label, value }) => (
                <div
                  key={key}
                  className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 border-b border-border py-[5px]"
                >
                  <Icon className="mt-[3px] size-3.5 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-4 text-muted-foreground">{label}</p>
                    <p className="[overflow-wrap:anywhere]">{value}</p>
                  </div>
                </div>
              ))}
            </section>

            <section>
              <div className="flex items-baseline justify-between gap-2 border-b border-foreground pb-1">
                <SectionLabel className="border-0 pb-0">{t("sectionAttachments")}</SectionLabel>
                <span className="text-[13px] text-muted-foreground">
                  {t("imageCount", { count: attachments.length })}
                </span>
              </div>
              {threadQ.isLoading ? (
                <Skeleton className="mt-1.5 h-7 w-full" />
              ) : attachments.length === 0 ? (
                <EmptyState bordered={false} className="py-1.5" title={t("noAttachments")} />
              ) : (
                <div className="flex flex-col">
                  {attachments.map((a) => (
                    <AttachmentChip
                      key={a.id}
                      asRow
                      attachment={a}
                      removeLabel={t("removeAttachment")}
                      removing={removeM.isPending}
                      onRemove={
                        thread && canRemoveAttachment(thread, a)
                          ? () => removeAttachment(a.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Anotação interna: existe só na visão da administração (o autor nunca a recebe). */}
            {ticket.adminNote && (
              <section>
                <SectionLabel>{t("detailAdminNote")}</SectionLabel>
                <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <EyeOff className="size-3.5 shrink-0" aria-hidden />
                  {t("adminNoteVisible")}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]">
                  {ticket.adminNote}
                </p>
              </section>
            )}
          </aside>

          {threadQ.isLoading || !thread ? (
            <div className="min-h-0 space-y-3 px-5 py-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="ml-auto h-12 w-3/4" />
            </div>
          ) : (
            <FeedbackThreadPane
              feedbackId={ticket.id}
              thread={thread}
              ns={ns}
              reportMessage={ticket.message}
              authorMeta={`${ticket.authorEmail ?? t("partyYou")} · ${fmtDate(ticket.createdAt)}`}
              canEdit={canEdit}
              editLockNote={author && !canEdit ? t("editLocked") : undefined}
              onStartEdit={startEdit}
              onReopen={canReopen ? author.onReopen : undefined}
              edit={
                author && {
                  active: editing,
                  message: draft.message,
                  onMessage: (v) =>
                    setDraft((d) => ({ ...d, message: v.slice(0, FEEDBACK_MESSAGE_MAX) })),
                  save: saveEdit,
                  cancel: () => setEditing(false),
                  saving: author.saving,
                  canSave: !!draft.title.trim() && !!draft.message.trim(),
                }
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
