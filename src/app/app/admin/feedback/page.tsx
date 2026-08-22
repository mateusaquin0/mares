"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { FeedbackStatusBadge, FeedbackTypeBadge } from "@/components/feedback-badges"
import { ThreadSummaryCell } from "@/components/feedback-thread"
import { FeedbackTicketDialog } from "@/components/feedback-ticket-dialog"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Abas/filtro: todos os status que um ticket pode ter.
const STATUSES: FeedbackStatus[] = ["NEW", "REOPENED", "IN_REVIEW", "RESOLVED", "WONT_FIX"]

// Status que a triagem GRAVA em um clique. `REOPENED` fica de fora (só o autor o produz) e
// `WONT_FIX` também: descartar exige justificativa, então abre o ticket na caixa de descarte.
const QUICK_STATUSES: FeedbackStatus[] = ["NEW", "IN_REVIEW", "RESOLVED"]

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
  // Guarda o id (não o objeto): assim o diálogo reflete o item recarregado após cada triagem.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? (all.find((f) => f.id === selectedId) ?? null) : null
  // Abrir o ticket já na caixa de descarte (vindo do menu de ações da linha).
  const [discardIntent, setDiscardIntent] = useState(false)

  async function run(id: string, data: Parameters<typeof updateM.mutateAsync>[0], ok: string) {
    setBusy(id)
    try {
      await updateM.mutateAsync(data)
      toast.success(ok)
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
      throw err
    } finally {
      setBusy(null)
    }
  }

  // Abre o ticket na caixa de descarte: a justificativa é obrigatória, então nunca é um clique.
  function openDiscard(f: FeedbackItem) {
    setSelectedId(f.id)
    setDiscardIntent(true)
  }

  // Em qual aba está cada ticket com mensagem nova do autor: sem isto, um ticket em
  // "Em análise" com resposta pendente fica invisível para quem está olhando "Novo".
  const unreadByStatus = all.reduce<Partial<Record<FeedbackStatus, number>>>((acc, f) => {
    if (f.unread) acc[f.status] = (acc[f.status] ?? 0) + 1
    return acc
  }, {})

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
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as FeedbackStatus | "ALL")}
          >
            <TabsList>
              <TabsTrigger value="ALL">{t("filterAll")}</TabsTrigger>
              {STATUSES.map((s) => (
                <TabsTrigger key={s} value={s} className="relative">
                  {t(`status_${s}`)}
                  {(unreadByStatus[s] ?? 0) > 0 && (
                    <span
                      role="status"
                      aria-label={t("unreadReply")}
                      title={t("unreadReply")}
                      className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-orange-500"
                    />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

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
                  <TableHead className="w-20 text-center">{t("colType")}</TableHead>
                  <TableHead>{t("colTitle")}</TableHead>
                  <TableHead className="w-56">{t("colAuthor")}</TableHead>
                  <TableHead className="w-36">{t("colDate")}</TableHead>
                  <TableHead className="w-20 text-center">{t("colStatus")}</TableHead>
                  <TableHead className="w-24">{t("colThread")}</TableHead>
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
                {items.length === 0 && <TableEmpty colSpan={7}>{tc("noResults")}</TableEmpty>}
                {items.map((f) => (
                  <TableRow
                    key={f.id}
                    onClick={() => {
                      setSelectedId(f.id)
                      setDiscardIntent(false)
                    }}
                    className="cursor-pointer"
                    title={t("viewDetails")}
                  >
                    <TableCell className="text-center">
                      <FeedbackTypeBadge type={f.type} ns="adminFeedback" iconOnly />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Truncate className="max-w-[22rem]">{f.title}</Truncate>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Truncate>{f.createdByEmail}</Truncate>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString(locale)}
                    </TableCell>
                    <TableCell className="text-center">
                      <FeedbackStatusBadge status={f.status} ns="adminFeedback" iconOnly />
                    </TableCell>
                    <TableCell>
                      <ThreadSummaryCell summary={f} ns="adminFeedback" />
                    </TableCell>
                    {/* stopPropagation: o menu de ações não deve abrir o diálogo do ticket. */}
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
                          {QUICK_STATUSES.filter((s) => s !== f.status).map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onSelect={() =>
                                run(f.id, { id: f.id, status: s }, t("updated")).catch(() => {})
                              }
                            >
                              {t("setStatus", { status: t(`status_${s}`) })}
                            </DropdownMenuItem>
                          ))}
                          {f.status !== "WONT_FIX" && (
                            <DropdownMenuItem onSelect={() => openDiscard(f)}>
                              {t("discard")}
                            </DropdownMenuItem>
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

      <FeedbackTicketDialog
        ns="adminFeedback"
        open={!!selected}
        onOpenChange={(o) => {
          if (o) return
          setSelectedId(null)
          setDiscardIntent(false)
        }}
        openDiscard={discardIntent}
        ticket={
          selected && {
            ...selected,
            authorName: selected.createdByName,
            authorEmail: selected.createdByEmail,
          }
        }
        admin={{
          busy: !!busy,
          onSetStatus: (status) =>
            run(selected!.id, { id: selected!.id, status }, t("updated")).then(() => {
              setDiscardIntent(false)
            }),
          onDiscard: (note) =>
            run(
              selected!.id,
              { id: selected!.id, status: "WONT_FIX", resolutionNote: note },
              t("discarded"),
            ).then(() => setDiscardIntent(false)),
        }}
      />
    </div>
  )
}
