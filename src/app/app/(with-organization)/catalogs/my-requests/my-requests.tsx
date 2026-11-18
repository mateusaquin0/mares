"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { useMyRequests } from "@/hooks/use-catalog-request"
import { RequestItemName } from "../request-item-name"
import { RequestStatusBadge } from "../request-status-badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ReloadButton } from "@/components/ui/reload-button"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function MyRequests() {
  const t = useTranslations("catalogRequests")
  const locale = useLocale()
  const listQ = useMyRequests()
  const items = listQ.data ?? []
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)

  return (
    <div className="space-y-4 px-page pb-8 pt-3.5">
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
          <h1 className="font-serif text-[28px] font-medium leading-8">{t("mineTitle")}</h1>
        </div>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">
          {t("mineSubtitle")}
        </p>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : (
        <div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">{t("colType")}</TableHead>
                <TableHead>{t("colItem")}</TableHead>
                <TableHead className="w-[130px]">{t("colStatus")}</TableHead>
                <TableHead>{t("fieldReviewNote")}</TableHead>
                <TableHead className="w-[120px] text-right">
                  <ReloadButton onReload={async () => void (await listQ.refetch())} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && <TableEmpty colSpan={5}>{t("mineEmpty")}</TableEmpty>}
              {items.map((r) => (
                <TableRow key={r.id} className="hover:bg-transparent">
                  <TableCell>
                    {t(`type_${r.type}`)}
                    {r.targetId && (
                      <span className="block text-[13px] text-muted-foreground">
                        {t("kindEdit")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RequestItemName locale={locale} request={r} />
                  </TableCell>
                  <TableCell>
                    <RequestStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.status === "REJECTED"
                      ? r.reviewNote === "duplicate"
                        ? t("rejectedDuplicate")
                        : r.reviewNote || "â€”"
                      : r.status === "APPROVED"
                        ? t("approvedNote")
                        : "â€”"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-muted-foreground">
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
