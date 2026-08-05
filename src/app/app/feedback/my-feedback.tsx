"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Lightbulb, Bug, Pencil } from "lucide-react"

import { cn } from "@/lib/utils"
import { useMyFeedback, useUpdateMyFeedback } from "@/hooks/use-feedback"
import { useErrorMessage } from "@/lib/use-error-message"
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TITLE_MAX,
  type FeedbackTypeValue,
} from "@/schemas/feedback.schema"
import type { FeedbackStatus, FeedbackType, MyFeedbackItem } from "@/types/feedback"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ReloadButton } from "@/components/ui/reload-button"
import { Truncate } from "@/components/ui/truncate"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Mesmas cores da tela de triagem (adminFeedback), para o usuário reconhecer o estado.
type BadgeVariant = React.ComponentProps<typeof Badge>["variant"]
const statusVariant: Record<FeedbackStatus, BadgeVariant> = {
  NEW: "inconclusive",
  IN_REVIEW: "private",
  RESOLVED: "positive",
  WONT_FIX: "negative",
}

export function MyFeedback() {
  const t = useTranslations("myFeedback")
  const locale = useLocale()

  const em = useErrorMessage()
  const listQ = useMyFeedback()
  const items = listQ.data ?? []
  // Guarda o id: assim o modal reflete o item recarregado depois de salvar uma correção.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? (items.find((f) => f.id === selectedId) ?? null) : null

  // Edição do próprio relato — só enquanto o feedback não entrou em triagem (status NEW).
  const updateM = useUpdateMyFeedback()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ type: FeedbackTypeValue; title: string; message: string }>({
    type: "SUGGESTION",
    title: "",
    message: "",
  })
  const canEdit = selected?.status === "NEW"
  const canSave = !!draft.title.trim() && !!draft.message.trim()

  function startEdit(f: MyFeedbackItem) {
    setDraft({ type: f.type, title: f.title, message: f.message })
    setEditing(true)
  }

  async function saveEdit() {
    if (!selected || !canSave) return
    try {
      await updateM.mutateAsync({
        id: selected.id,
        type: draft.type,
        title: draft.title.trim(),
        message: draft.message.trim(),
      })
      toast.success(t("saved"))
      setEditing(false)
    } catch (err) {
      // Inclui o caso de corrida: o admin triou entre abrir a edição e salvar.
      toast.error(t("saveError"), { description: em(err) })
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale)

  function typeBadge(type: FeedbackType) {
    const Icon = type === "BUG" ? Bug : Lightbulb
    return (
      <Badge variant={type === "BUG" ? "destructive" : "secondary"} className="gap-1">
        <Icon className="size-3" />
        {t(type === "BUG" ? "typeBug" : "typeSuggestion")}
      </Badge>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">{t("colType")}</TableHead>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead className="w-32">{t("colDate")}</TableHead>
                <TableHead className="w-28">{t("colStatus")}</TableHead>
                <TableHead>{t("colResolution")}</TableHead>
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
              {items.length === 0 && <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>}
              {items.map((f) => (
                <TableRow
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className="cursor-pointer"
                  title={t("viewDetails")}
                >
                  <TableCell>{typeBadge(f.type)}</TableCell>
                  <TableCell className="font-medium">
                    <Truncate className="max-w-[18rem]">{f.title}</Truncate>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(f.createdAt).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[f.status]}>{t(`status_${f.status}`)}</Badge>
                  </TableCell>
                  <TableCell
                    className={cn("text-sm", !f.resolutionNote && "text-muted-foreground")}
                  >
                    <Truncate className="max-w-[16rem]">
                      {f.resolutionNote || t("resolutionEmpty")}
                    </Truncate>
                  </TableCell>
                  {/* Atalho de edição direto na linha (stopPropagation: não abre o detalhe). */}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {f.status === "NEW" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title={t("edit")}
                        onClick={() => {
                          setSelectedId(f.id)
                          startEdit(f)
                        }}
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">{t("edit")}</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detalhe: a mensagem enviada e a resposta da administração por inteiro. */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (o) return
          setSelectedId(null)
          setEditing(false)
        }}
      >
        <DialogContent>
          {selected && (
            <>
              <DialogHeader className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {typeBadge(selected.type)}
                  <Badge variant={statusVariant[selected.status]}>
                    {t(`status_${selected.status}`)}
                  </Badge>
                  {canEdit && !editing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 gap-1.5"
                      onClick={() => startEdit(selected)}
                    >
                      <Pencil className="size-3.5" />
                      {t("edit")}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="min-w-0 space-y-4">
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailTitle")}
                  </h3>
                  {editing ? (
                    <>
                      {/* DialogTitle continua no DOM (acessibilidade), mas oculto no modo edição. */}
                      <DialogTitle className="sr-only">{selected.title}</DialogTitle>
                      <Input
                        value={draft.title}
                        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        maxLength={FEEDBACK_TITLE_MAX}
                        aria-label={t("titleLabel")}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {draft.title.length}/{FEEDBACK_TITLE_MAX}
                      </p>
                    </>
                  ) : (
                    <DialogTitle className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
                      {selected.title}
                    </DialogTitle>
                  )}
                  <DialogDescription className="mt-1 text-sm">
                    {t("sentAt", { date: fmtDate(selected.createdAt) })}
                  </DialogDescription>
                </section>

                {editing && (
                  <section className="space-y-2">
                    <Label>{t("typeLabel")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["SUGGESTION", "BUG"] as const).map((value) => {
                        const Icon = value === "BUG" ? Bug : Lightbulb
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, type: value }))}
                            className={cn(
                              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                              draft.type === value
                                ? "border-primary bg-accent font-medium text-accent-foreground"
                                : "border-border text-foreground/70 hover:bg-muted",
                            )}
                          >
                            <Icon className="size-4" />
                            {t(value === "BUG" ? "typeBug" : "typeSuggestion")}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailMessage")}
                  </h3>
                  {editing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={draft.message}
                        onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
                        maxLength={FEEDBACK_MESSAGE_MAX}
                        rows={5}
                        aria-label={t("messageLabel")}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {draft.message.length}/{FEEDBACK_MESSAGE_MAX}
                        </span>
                        <div className="ml-auto flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(false)}
                            disabled={updateM.isPending}
                          >
                            {t("cancel")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={saveEdit}
                            loading={updateM.isPending}
                            disabled={!canSave}
                          >
                            {t("save")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {selected.message}
                    </div>
                  )}
                  {!editing && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {canEdit ? t("editHint") : t("editLocked")}
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailResolution")}
                  </h3>
                  <p
                    className={cn(
                      "whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]",
                      !selected.resolutionNote && "text-muted-foreground",
                    )}
                  >
                    {selected.resolutionNote || t("resolutionEmpty")}
                  </p>
                  {selected.resolutionNote && selected.reviewedAt && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t("answeredAt", { date: fmtDate(selected.reviewedAt) })}
                    </p>
                  )}
                </section>

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
    </div>
  )
}
