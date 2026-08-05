"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Lightbulb, Bug } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ReloadButton } from "@/components/ui/reload-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useErrorMessage } from "@/lib/use-error-message"
import { useFeedbackList, useUpdateFeedback } from "@/hooks/use-feedback"
import type { FeedbackItem, FeedbackStatus, FeedbackType } from "@/types/feedback"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FEEDBACK_RESOLUTION_MAX, FEEDBACK_RESOLUTION_MIN } from "@/schemas/feedback.schema"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUSES: FeedbackStatus[] = ["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX"]

// Cores distintas por status (variantes semânticas do Badge, ver design.md §Chips/Badges):
// NEW âmbar (a triar) · IN_REVIEW marca (em andamento) · RESOLVED verde · WONT_FIX cinza.
type BadgeVariant = React.ComponentProps<typeof Badge>["variant"]
const statusVariant: Record<FeedbackStatus, BadgeVariant> = {
  NEW: "inconclusive",
  IN_REVIEW: "private",
  RESOLVED: "positive",
  WONT_FIX: "negative",
}

const TYPES: FeedbackType[] = ["SUGGESTION", "BUG"]

export default function AdminFeedbackPage() {
  const t = useTranslations("adminFeedback")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  // Abre já filtrando os novos (a triar); o usuário pode trocar para "Todos".
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "ALL">("NEW")
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "ALL">("ALL")
  const [author, setAuthor] = useState("")

  // Busca a lista completa e filtra no cliente (status, tipo, autor). Dataset pequeno.
  const listQ = useFeedbackList()
  const all = listQ.data ?? []
  const authorQ = author.trim().toLowerCase()
  const items = all
    .filter((f) => statusFilter === "ALL" || f.status === statusFilter)
    .filter((f) => typeFilter === "ALL" || f.type === typeFilter)
    .filter((f) => !authorQ || f.createdByEmail.toLowerCase().includes(authorQ))
    // Mais novo → mais antigo (a API já ordena desc; reforçado aqui).
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const updateM = useUpdateFeedback()
  const [busy, setBusy] = useState<string | null>(null)
  // Guarda o id (não o objeto): assim o modal reflete o item recarregado após cada triagem.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? (all.find((f) => f.id === selectedId) ?? null) : null

  // Edição da resposta ao autor, dentro do modal de detalhes.
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")
  // Descarte: exige justificativa, então passa por um diálogo próprio (nunca em um clique).
  const [discardId, setDiscardId] = useState<string | null>(null)
  const [discardNote, setDiscardNote] = useState("")

  // Enquanto o feedback está descartado, a resposta não pode ficar vazia/curta — o botão
  // de salvar já reflete a regra que o servidor aplica.
  const resolutionTooShort =
    selected?.status === "WONT_FIX" && noteDraft.trim().length < FEEDBACK_RESOLUTION_MIN
  const discardTooShort = discardNote.trim().length < FEEDBACK_RESOLUTION_MIN

  async function setStatus(id: string, status: FeedbackStatus) {
    setBusy(id)
    try {
      await updateM.mutateAsync({ id, status })
      toast.success(t("updated"))
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
    } finally {
      setBusy(null)
    }
  }

  // Abre o diálogo de descarte já com a resposta atual (se houver) para o admin completar.
  function openDiscard(f: FeedbackItem) {
    setDiscardId(f.id)
    setDiscardNote(f.resolutionNote ?? "")
  }

  async function confirmDiscard() {
    if (!discardId) return
    setBusy(discardId)
    try {
      await updateM.mutateAsync({
        id: discardId,
        status: "WONT_FIX",
        resolutionNote: discardNote.trim(),
      })
      toast.success(t("discarded"))
      setDiscardId(null)
      setDiscardNote("")
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
    } finally {
      setBusy(null)
    }
  }

  async function saveResolution() {
    if (!selected) return
    setBusy(selected.id)
    try {
      await updateM.mutateAsync({ id: selected.id, resolutionNote: noteDraft.trim() || null })
      toast.success(t("resolutionSaved"))
      setEditingNote(false)
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
    } finally {
      setBusy(null)
    }
  }

  function typeBadge(type: FeedbackType) {
    const Icon = type === "BUG" ? Bug : Lightbulb
    return (
      <Badge variant={type === "BUG" ? "destructive" : "secondary"} className="gap-1">
        <Icon className="size-3" />
        {t(type === "BUG" ? "typeBug" : "typeSuggestion")}
      </Badge>
    )
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale)

  // Campo de filtro rotulado, no mesmo estilo das outras tabelas.
  const filterField = (label: string, control: React.ReactNode, widthClass = "w-44") => (
    <label className={cn("flex flex-col gap-1 text-xs", widthClass)}>
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {control}
    </label>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {/* Status: tabs (mesmo modelo da tela de glossário) */}
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as FeedbackStatus | "ALL")}
          >
            <TabsList>
              <TabsTrigger value="ALL">{t("filterAll")}</TabsTrigger>
              {STATUSES.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {t(`status_${s}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Tipo (select) + autor (input), no estilo das outras tabelas */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-card">
            {filterField(
              t("filterType"),
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as FeedbackType | "ALL")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("filterAll")}</SelectItem>
                  {TYPES.map((ty) => (
                    <SelectItem key={ty} value={ty}>
                      {t(ty === "BUG" ? "typeBug" : "typeSuggestion")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>,
            )}
            {filterField(
              t("colAuthor"),
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t("authorPlaceholder")}
                className="h-9"
              />,
              "w-64",
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t("colType")}</TableHead>
                  <TableHead>{t("colTitle")}</TableHead>
                  <TableHead className="w-56">{t("colAuthor")}</TableHead>
                  <TableHead className="w-36">{t("colDate")}</TableHead>
                  <TableHead className="w-28">{t("colStatus")}</TableHead>
                  <TableHead className="w-16 text-right">
                    <ReloadButton
                      onReload={async () => {
                        await listQ.refetch()
                      }}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && <TableEmpty colSpan={6}>{tc("noResults")}</TableEmpty>}
                {items.map((f) => (
                  <TableRow
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className="cursor-pointer"
                    title={t("viewDetails")}
                  >
                    <TableCell>{typeBadge(f.type)}</TableCell>
                    <TableCell className="font-medium">
                      <Truncate className="max-w-[22rem]">{f.title}</Truncate>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Truncate>{f.createdByEmail}</Truncate>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString(locale)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[f.status]}>{t(`status_${f.status}`)}</Badge>
                    </TableCell>
                    {/* stopPropagation: o menu de ações não deve abrir o modal de detalhes. */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            disabled={busy === f.id}
                            loading={busy === f.id}
                          >
                            {busy !== f.id && <MoreHorizontal className="size-4" />}
                            <span className="sr-only">{t("colActions")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {STATUSES.filter((s) => s !== f.status).map((s) =>
                            // Descartar abre o diálogo (justificativa obrigatória); os demais
                            // status seguem em um clique.
                            s === "WONT_FIX" ? (
                              <DropdownMenuItem key={s} onSelect={() => openDiscard(f)}>
                                {t("discard")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem key={s} onSelect={() => setStatus(f.id, s)}>
                                {t("setStatus", { status: t(`status_${s}`) })}
                              </DropdownMenuItem>
                            ),
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Modal de detalhes (clique na linha) */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (o) return
          setSelectedId(null)
          setEditingNote(false)
        }}
      >
        <DialogContent>
          {selected && (
            <>
              <DialogHeader className="min-w-0">
                {/* Badges de tipo e status, lado a lado, no topo. */}
                <div className="flex flex-wrap items-center gap-2">
                  {typeBadge(selected.type)}
                  <Badge variant={statusVariant[selected.status]}>
                    {t(`status_${selected.status}`)}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="min-w-0 space-y-4">
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailTitle")}
                  </h3>
                  <DialogTitle className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
                    {selected.title}
                  </DialogTitle>
                </section>

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailAuthor")}
                  </h3>
                  <DialogDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm [overflow-wrap:anywhere]">
                    <span className="font-medium text-foreground/80">
                      {selected.createdByEmail}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{fmtDate(selected.createdAt)}</span>
                  </DialogDescription>
                </section>

                {/* Mensagem: quebra palavras longas (mesmo sem espaços) e rola se for grande. */}
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailMessage")}
                  </h3>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {selected.message}
                  </div>
                </section>

                {/* Resposta ao autor: editável em QUALQUER status; obrigatória em WONT_FIX
                    (o servidor recusa deixá-la vazia enquanto o feedback estiver descartado). */}
                <section>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("detailResolution")}
                    </h3>
                    <Badge variant="outline">{t("resolutionVisible")}</Badge>
                    {!editingNote && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7"
                        onClick={() => {
                          setNoteDraft(selected.resolutionNote ?? "")
                          setEditingNote(true)
                        }}
                      >
                        {t("edit")}
                      </Button>
                    )}
                  </div>

                  {editingNote ? (
                    <div className="space-y-2">
                      <Textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder={t("resolutionPlaceholder")}
                        maxLength={FEEDBACK_RESOLUTION_MAX}
                        rows={4}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {noteDraft.trim().length}/{FEEDBACK_RESOLUTION_MAX}
                        </span>
                        {resolutionTooShort && (
                          <span className="text-xs text-destructive">
                            {t("resolutionMin", { min: FEEDBACK_RESOLUTION_MIN })}
                          </span>
                        )}
                        <div className="ml-auto flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingNote(false)}
                            disabled={busy === selected.id}
                          >
                            {t("cancel")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={saveResolution}
                            loading={busy === selected.id}
                            disabled={resolutionTooShort}
                          >
                            {t("save")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={cn(
                        "whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]",
                        !selected.resolutionNote && "text-muted-foreground",
                      )}
                    >
                      {selected.resolutionNote || t("resolutionEmpty")}
                    </p>
                  )}

                  {selected.reviewedAt && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t("reviewedAt", { date: fmtDate(selected.reviewedAt) })}
                    </p>
                  )}
                </section>

                {/* Anotação interna do admin — nunca sai para o autor (ver mineSelect). */}
                {selected.adminNote && (
                  <section>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("detailAdminNote")}
                      </h3>
                      <Badge variant="faded">{t("adminNoteVisible")}</Badge>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {selected.adminNote}
                    </p>
                  </section>
                )}

                {selected.pageUrl && (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("detailPage")}
                    </h3>
                    <code className="inline-block max-w-full rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {selected.pageUrl}
                    </code>
                  </section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Descarte: só conclui com justificativa, que o autor lê em /app/feedback. */}
      <Dialog
        open={!!discardId}
        onOpenChange={(o) => {
          if (o) return
          setDiscardId(null)
          setDiscardNote("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("discardTitle")}</DialogTitle>
            <DialogDescription>{t("discardDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="discard-note">{t("detailResolution")}</Label>
              <span className="text-xs text-muted-foreground">
                {discardNote.trim().length}/{FEEDBACK_RESOLUTION_MAX}
              </span>
            </div>
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
              <p className="text-xs text-muted-foreground">
                {t("resolutionMin", { min: FEEDBACK_RESOLUTION_MIN })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDiscardId(null)}
              disabled={busy === discardId}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDiscard}
              loading={busy === discardId}
              disabled={discardTooShort}
            >
              {t("discardConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
