"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Lightbulb, Bug, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ReloadButton } from "@/components/ui/reload-button"
import { useErrorMessage } from "@/lib/use-error-message"
import { useFeedbackList, useUpdateFeedback } from "@/hooks/use-feedback"
import type { FeedbackItem, FeedbackStatus, FeedbackType } from "@/types/feedback"
import {
  Table,
  TableBody,
  TableCell,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUSES: FeedbackStatus[] = ["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX"]

const statusVariant: Record<FeedbackStatus, "default" | "secondary" | "outline" | "negative"> = {
  NEW: "default",
  IN_REVIEW: "secondary",
  RESOLVED: "outline",
  WONT_FIX: "negative",
}

const TYPES: FeedbackType[] = ["SUGGESTION", "BUG"]

export default function AdminFeedbackPage() {
  const t = useTranslations("adminFeedback")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "ALL">("ALL")
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
  const [selected, setSelected] = useState<FeedbackItem | null>(null)

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
          {/* Filtros: busca por autor + chips de status e tipo */}
          <div className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t("authorPlaceholder")}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t("filterStatus")}</span>
              {(["ALL", ...STATUSES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    statusFilter === s
                      ? "border-primary bg-accent font-medium text-accent-foreground"
                      : "border-border text-foreground/70 hover:bg-muted",
                  )}
                >
                  {s === "ALL" ? t("filterAll") : t(`status_${s}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t("filterType")}</span>
              {(["ALL", ...TYPES] as const).map((ty) => (
                <button
                  key={ty}
                  type="button"
                  onClick={() => setTypeFilter(ty)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    typeFilter === ty
                      ? "border-primary bg-accent font-medium text-accent-foreground"
                      : "border-border text-foreground/70 hover:bg-muted",
                  )}
                >
                  {ty === "ALL" ? t("filterAll") : t(ty === "BUG" ? "typeBug" : "typeSuggestion")}
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tc("noResults")}</p>
          ) : (
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
                  {items.map((f) => (
                    <TableRow
                      key={f.id}
                      onClick={() => setSelected(f)}
                      className="cursor-pointer"
                      title={t("viewDetails")}
                    >
                      <TableCell>{typeBadge(f.type)}</TableCell>
                      <TableCell className="font-medium">{f.title}</TableCell>
                      <TableCell className="text-sm">{f.createdByEmail}</TableCell>
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
                            {STATUSES.filter((s) => s !== f.status).map((s) => (
                              <DropdownMenuItem key={s} onSelect={() => setStatus(f.id, s)}>
                                {t("setStatus", { status: t(`status_${s}`) })}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Modal de detalhes (clique na linha) */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
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

                {selected.adminNote && (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("detailAdminNote")}
                    </h3>
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
    </div>
  )
}
