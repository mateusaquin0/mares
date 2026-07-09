"use client"

import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Controles de paginação (client ou server-side). Namespace i18n: `pagination`.
export function TablePagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 30],
  onPageChange,
  onPageSizeChange,
}: {
  page: number // 1-based
  pageSize: number
  total: number
  pageSizeOptions?: readonly number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const t = useTranslations("pagination")
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{t("rowsPerPage")}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[4.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{t("range", { from, to, total })}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
            aria-label={t("previous")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[6rem] text-center text-muted-foreground">
            {t("pageOf", { page: current, pages: pageCount })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={current >= pageCount}
            onClick={() => onPageChange(current + 1)}
            aria-label={t("next")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
