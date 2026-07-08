"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Lightbulb, Bug } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

export default function AdminFeedbackPage() {
  const t = useTranslations("adminFeedback")
  const locale = useLocale()
  const em = useErrorMessage()

  const [filter, setFilter] = useState<FeedbackStatus | "ALL">("ALL")
  const listQ = useFeedbackList(filter === "ALL" ? undefined : filter)
  const items = listQ.data ?? []
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

      {/* Filtro por status */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              filter === s
                ? "border-primary bg-accent font-medium text-accent-foreground"
                : "border-border text-foreground/70 hover:bg-muted",
            )}
          >
            {s === "ALL" ? t("filterAll") : t(`status_${s}`)}
          </button>
        ))}
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">{t("colType")}</TableHead>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead className="w-56">{t("colAuthor")}</TableHead>
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
                  <TableCell>
                    <span className="text-sm">{f.createdByEmail}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString(locale)}
                    </span>
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

      {/* Modal de detalhes (clique na linha) */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {typeBadge(selected.type)}
                  <span className="truncate">{selected.title}</span>
                </DialogTitle>
                <DialogDescription>
                  {selected.createdByEmail} · {fmtDate(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailStatus")}
                  </p>
                  <Badge variant={statusVariant[selected.status]}>
                    {t(`status_${selected.status}`)}
                  </Badge>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("detailMessage")}
                  </p>
                  <p className="whitespace-pre-wrap">{selected.message}</p>
                </div>
                {selected.pageUrl && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("detailPage")}
                    </p>
                    <p className="break-all text-muted-foreground">{selected.pageUrl}</p>
                  </div>
                )}
                {selected.adminNote && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("detailAdminNote")}
                    </p>
                    <p className="whitespace-pre-wrap">{selected.adminNote}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
