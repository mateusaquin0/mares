"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, X } from "lucide-react"

import { txt, pathogenName } from "@/lib/catalog-i18n"
import { slugify } from "@/lib/slug"
import { useErrorMessage } from "@/lib/use-error-message"
import { useCatalogList, usePathogenGroups } from "@/hooks/use-catalog"
import {
  useReviewableRequests,
  useApproveRequest,
  useRejectRequest,
} from "@/hooks/use-catalog-request"
import type { CatalogRequestItem, CatalogRequestStatus } from "@/types/catalog-request"
import type { NamedRow, PathogenRow } from "@/types/catalog"
import { catalogTypeOfRequest, requestItemName, requestNormalizedNames } from "../request-display"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ReloadButton } from "@/components/ui/reload-button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const STATUSES: CatalogRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"]
const statusVariant: Record<CatalogRequestStatus, "default" | "outline" | "negative"> = {
  PENDING: "default",
  APPROVED: "outline",
  REJECTED: "negative",
}

export function RequestsReview({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const t = useTranslations("catalogRequests")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  const [status, setStatus] = useState<CatalogRequestStatus>("PENDING")
  const listQ = useReviewableRequests(status)
  const items = listQ.data ?? []

  const [selected, setSelected] = useState<CatalogRequestItem | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")

  const approveM = useApproveRequest()
  const rejectM = useRejectRequest()

  const groupsQ = usePathogenGroups()
  const groupName = (id?: string) => {
    const g = groupsQ.data?.find((x) => x.id === id)
    return g ? txt(locale, g.name) : ""
  }

  // L2 — parecidos: itens já existentes no glossário do mesmo tipo (dedup na curadoria).
  const selType = selected ? catalogTypeOfRequest(selected.type) : "organs"
  const glossaryQ = useCatalogList(selType)
  const similarExisting = useMemo(() => {
    if (!selected) return [] as string[]
    const norms = requestNormalizedNames(selected)
    if (!norms.length) return []
    const rows = glossaryQ.data ?? []
    const names = (r: NamedRow | PathogenRow): string[] =>
      selected.type === "PATHOGEN"
        ? [(r as PathogenRow).scientificName ?? "", txt(locale, (r as PathogenRow).name)]
        : [txt(locale, (r as NamedRow).name)]
    const hit = (n: string) => {
      const s = slugify(n)
      return !!s && norms.some((q) => s === q || s.includes(q) || q.includes(s))
    }
    const out: string[] = []
    for (const r of rows) {
      if (names(r).some(hit))
        out.push(
          selected.type === "PATHOGEN"
            ? pathogenName(locale, r as PathogenRow)
            : txt(locale, (r as NamedRow).name),
        )
    }
    return out.slice(0, 5)
  }, [selected, glossaryQ.data, locale])

  function closeAll() {
    setSelected(null)
    setRejecting(false)
    setNote("")
  }

  async function approve(r: CatalogRequestItem) {
    try {
      await approveM.mutateAsync(r.id)
      toast.success(t("approved"))
      closeAll()
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
    }
  }
  async function reject(r: CatalogRequestItem) {
    try {
      await rejectM.mutateAsync({ id: r.id, note })
      toast.success(t("rejected"))
      closeAll()
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)
  const requesterLabel = (r: CatalogRequestItem) =>
    isSystemAdmin && r.requestedByEmail
      ? r.requestedByEmail
      : r.orgName
        ? t("fromGroup", { group: r.orgName })
        : t("fromUnknown")

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as CatalogRequestStatus)}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`status_${s}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("colType")}</TableHead>
                <TableHead>{t("colItem")}</TableHead>
                <TableHead className="w-56">{t("colRequester")}</TableHead>
                <TableHead className="w-28">{t("colDate")}</TableHead>
                <TableHead className="w-16 text-right">
                  <ReloadButton onReload={async () => void (await listQ.refetch())} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && <TableEmpty colSpan={5}>{t("empty")}</TableEmpty>}
              {items.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer"
                  title={t("viewDetails")}
                >
                  <TableCell>
                    <Badge variant="secondary">{t(`type_${r.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Truncate className="max-w-[20rem]">{requestItemName(locale, r)}</Truncate>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <Truncate>{requesterLabel(r)}</Truncate>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    <Badge variant={statusVariant[r.status]}>{t(`status_${r.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeAll()}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`type_${selected.type}`)}</Badge>
                  <Badge variant={statusVariant[selected.status]}>
                    {t(`status_${selected.status}`)}
                  </Badge>
                </div>
                <DialogTitle className="text-lg">{requestItemName(locale, selected)}</DialogTitle>
                <DialogDescription>{requesterLabel(selected)}</DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-4 text-sm">
                <Field label={t("fieldNamePt")} value={selected.payload.namePt} />
                <Field label={t("fieldNameEn")} value={selected.payload.nameEn} />
                {selected.type === "PATHOGEN" && (
                  <>
                    <Field label={t("fieldSci")} value={selected.payload.scientificName} />
                    <Field label={t("fieldGroup")} value={groupName(selected.payload.groupId)} />
                    {selected.payload.taxonId != null && (
                      <Field
                        label={t("fieldTaxon")}
                        value={`taxID ${selected.payload.taxonId} · ${[selected.payload.taxonFamily, selected.payload.taxonOrder].filter(Boolean).join(" · ") || "—"}`}
                      />
                    )}
                  </>
                )}
                {selected.type === "EXAM_TYPE" && selected.payload.measurePt && (
                  <Field
                    label={t("fieldMeasure")}
                    value={`${selected.payload.measurePt}${selected.payload.measureUnit ? ` (${selected.payload.measureUnit})` : ""}`}
                  />
                )}

                {similarExisting.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      {t("similarExisting")}
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {similarExisting.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.status === "REJECTED" && selected.reviewNote && (
                  <Field label={t("fieldReviewNote")} value={selected.reviewNote} />
                )}

                {selected.status === "PENDING" && rejecting && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("rejectNoteLabel")}
                    </label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("rejectNotePlaceholder")}
                      rows={3}
                    />
                  </div>
                )}
              </DialogBody>

              {selected.status === "PENDING" && (
                <DialogFooter>
                  {rejecting ? (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(false)}>
                        {tc("cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        loading={rejectM.isPending}
                        onClick={() => reject(selected)}
                      >
                        <X className="size-4" />
                        {t("confirmReject")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(true)}>
                        <X className="size-4" />
                        {t("reject")}
                      </Button>
                      <Button loading={approveM.isPending} onClick={() => approve(selected)}>
                        <Check className="size-4" />
                        {t("approve")}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="[overflow-wrap:anywhere]">{value}</p>
    </div>
  )
}
