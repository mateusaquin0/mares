"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Search } from "lucide-react"

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
import { FEEDBACK_TYPE_META, FeedbackStatusBadge } from "@/components/feedback-badges"
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
import { EmptyState } from "@/components/ui/empty-state"

// Abas/filtro: todos os status que um ticket pode ter.
const STATUSES: FeedbackStatus[] = ["NEW", "REOPENED", "IN_REVIEW", "RESOLVED", "WONT_FIX"]

// Status que a triagem GRAVA em um clique. `REOPENED` fica de fora (só o autor o produz) e
// `WONT_FIX` também: descartar exige justificativa, então abre o ticket na caixa de descarte.
const QUICK_STATUSES: FeedbackStatus[] = ["NEW", "IN_REVIEW", "RESOLVED"]

const TYPES: FeedbackType[] = ["SUGGESTION", "BUG"]

const SEGMENT =
  "px-2.5 py-[3px] data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"

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

  return (
    <div className="px-page pb-8 pt-3.5">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : all.length === 0 ? (
        <EmptyState className="border-t-2" title={t("empty")} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="relative min-w-0 flex-[0_1_320px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t("authorPlaceholder")}
                aria-label={t("colAuthor")}
                className="pl-8"
              />
            </div>
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as FeedbackStatus | "ALL")}
            >
              <TabsList
                aria-label={t("filterStatus")}
                className="gap-0 rounded-sm border border-input text-sm"
              >
                <TabsTrigger value="ALL" className={SEGMENT}>
                  {t("filterAll")}
                </TabsTrigger>
                {STATUSES.map((s) => (
                  <TabsTrigger key={s} value={s} className={`relative ${SEGMENT}`}>
                    {t(`status_${s}`)}
                    {(unreadByStatus[s] ?? 0) > 0 && (
                      <span
                        role="status"
                        aria-label={t("unreadReply")}
                        title={t("unreadReply")}
                        className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-info"
                      />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as FeedbackType | "ALL")}
            >
              <SelectTrigger className="w-[150px]" aria-label={t("filterType")}>
                <span>
                  <span className="text-muted-foreground">{t("filterType")}</span> <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filterAll")}</SelectItem>
                {TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {t(ty === "BUG" ? "typeBug" : "typeSuggestion")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">{t("count", { count: items.length })}</span>
          </div>

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">{t("colType")}</TableHead>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead className="w-[22%]">{t("colAuthor")}</TableHead>
                <TableHead className="w-[100px]">{t("colDate")}</TableHead>
                <TableHead className="w-[126px]">{t("colStatus")}</TableHead>
                <TableHead className="w-[236px]">{t("colThread")}</TableHead>
                <TableHead className="w-11 text-right">
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
                  <TableCell className={f.type === "BUG" ? "font-semibold" : undefined}>
                    {t(FEEDBACK_TYPE_META[f.type].labelKey)}
                  </TableCell>
                  <TableCell className="font-semibold">
                    <Truncate className="max-w-full">{f.title}</Truncate>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Truncate className="max-w-full">{f.createdByEmail}</Truncate>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(f.createdAt).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell>
                    <FeedbackStatusBadge status={f.status} ns="adminFeedback" />
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
                          className="size-7 text-muted-foreground"
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
