"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"

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
import { RequestItemName } from "../request-item-name"
import { RequestStatusBadge } from "../request-status-badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DataRow } from "@/components/ui/section"
import { cn } from "@/lib/utils"
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
    <div className="px-page pb-8 pt-3.5">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href="/app/catalogs"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] underline underline-offset-2 hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            {t("backToGlossary")}
          </Link>
          <span aria-hidden className="h-5 w-px bg-border" />
          <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        </div>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs
        value={status}
        onValueChange={(v) => setStatus(v as CatalogRequestStatus)}
        className="mb-2.5 mt-2.5"
      >
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
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[190px]">{t("colType")}</TableHead>
              <TableHead>{t("colItem")}</TableHead>
              <TableHead className="w-[38%]">{t("colRequester")}</TableHead>
              <TableHead className="w-[104px]">{t("colDate")}</TableHead>
              <TableHead className="w-[120px] text-right">
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
                  {t(`type_${r.type}`)}
                  {r.targetId && (
                    <span className="block text-[13px] text-muted-foreground">{t("kindEdit")}</span>
                  )}
                </TableCell>
                <TableCell>
                  <RequestItemName locale={locale} request={r} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Truncate className="max-w-full">{requesterLabel(r)}</Truncate>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {fmtDate(r.createdAt)}
                </TableCell>
                <TableCell>
                  <RequestStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeAll()}>
        <DialogContent className="max-w-[540px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle
                  className={cn(
                    "[overflow-wrap:anywhere]",
                    selected.type === "PATHOGEN" && selected.payload.scientificName && "italic",
                  )}
                >
                  {requestItemName(locale, selected)}
                </DialogTitle>
                <DialogDescription>
                  {[
                    t(`type_${selected.type}`),
                    selected.targetId ? t("kindEdit") : null,
                    t(`status_${selected.status}`),
                    requesterLabel(selected),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-2.5">
                <dl>
                  <Field label={t("fieldNamePt")} value={selected.payload.namePt} />
                  <Field label={t("fieldNameEn")} value={selected.payload.nameEn} />
                  {selected.type === "PATHOGEN" && (
                    <>
                      <Field
                        label={t("fieldSci")}
                        value={selected.payload.scientificName}
                        scientific
                      />
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
                  {selected.status === "REJECTED" && selected.reviewNote && (
                    <Field label={t("fieldReviewNote")} value={selected.reviewNote} />
                  )}
                </dl>

                {similarExisting.length > 0 && (
                  <p className="rounded-sm border border-warning bg-warning-subtle px-2.5 py-1.5 font-semibold text-warning">
                    {t("similarExisting")} {similarExisting.join(", ")}
                  </p>
                )}

                {selected.status === "PENDING" && rejecting && (
                  <div className="space-y-0.5">
                    <Label htmlFor="reject-note">{t("rejectNoteLabel")}</Label>
                    <Textarea
                      id="reject-note"
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
                        {t("confirmReject")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(true)}>
                        {t("reject")}
                      </Button>
                      <Button loading={approveM.isPending} onClick={() => approve(selected)}>
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

function Field({
  label,
  value,
  scientific = false,
}: {
  label: string
  value?: string | null
  scientific?: boolean
}) {
  if (!value) return null
  return (
    <DataRow label={label}>
      <span
        className={cn(
          "[overflow-wrap:anywhere]",
          scientific ? "font-serif text-base italic" : "font-semibold",
        )}
      >
        {value}
      </span>
    </DataRow>
  )
}
