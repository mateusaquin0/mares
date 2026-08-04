"use client"

import { useLocale, useTranslations } from "next-intl"

import { useMyRequests } from "@/hooks/use-catalog-request"
import type { CatalogRequestStatus } from "@/types/catalog-request"
import { requestItemName } from "../request-display"
import { Badge } from "@/components/ui/badge"
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

const statusVariant: Record<CatalogRequestStatus, "default" | "outline" | "negative"> = {
  PENDING: "default",
  APPROVED: "outline",
  REJECTED: "negative",
}

export function MyRequests() {
  const t = useTranslations("catalogRequests")
  const locale = useLocale()
  const listQ = useMyRequests()
  const items = listQ.data ?? []
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("mineTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("mineSubtitle")}</p>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("colType")}</TableHead>
                <TableHead>{t("colItem")}</TableHead>
                <TableHead className="w-28">{t("colStatus")}</TableHead>
                <TableHead>{t("fieldReviewNote")}</TableHead>
                <TableHead className="w-28 text-right">
                  <ReloadButton onReload={async () => void (await listQ.refetch())} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && <TableEmpty colSpan={5}>{t("mineEmpty")}</TableEmpty>}
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="secondary">{t(`type_${r.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Truncate className="max-w-[16rem]">{requestItemName(locale, r)}</Truncate>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status]}>{t(`status_${r.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.status === "REJECTED"
                      ? r.reviewNote === "duplicate"
                        ? t("rejectedDuplicate")
                        : r.reviewNote || "—"
                      : r.status === "APPROVED"
                        ? t("approvedNote")
                        : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
