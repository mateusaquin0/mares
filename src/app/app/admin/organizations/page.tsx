"use client"

import { useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Search } from "lucide-react"

import { getCountryName } from "@/lib/countries"
import { useTable } from "@/lib/use-table"
import { useAdminOrganizations } from "@/hooks/use-admin"
import type { AdminOrg } from "@/types/admin"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { OrgMembers } from "./org-members"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { SortableHead } from "@/components/ui/sortable-head"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function AdminOrganizationsPage() {
  const t = useTranslations("adminOrgs")
  const tc = useTranslations("common")
  const locale = useLocale()

  const orgsQ = useAdminOrganizations()
  const orgs = orgsQ.data ?? []
  const loading = orgsQ.isLoading
  // Guarda o id; o objeto é derivado da lista viva para refletir mutações de membros.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = orgs.find((o) => o.id === selectedId) ?? null

  // Texto puro da localização (cidade, estado, país traduzido), usado em busca/ordenação.
  const locationText = useCallback(
    (o: Pick<AdminOrg, "city" | "state" | "country">) =>
      [o.city, o.state, getCountryName(o.country, locale)].filter(Boolean).join(", "),
    [locale],
  )

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)

  const table = useTable(orgs, {
    locale,
    initialSort: { key: "name" },
    columns: {
      name: (o) => o.name,
      location: (o) => locationText(o),
      members: (o) => o.members.length,
      research: (o) => o.researchCount,
      created: (o) => o.createdAt,
    },
    search: (o) =>
      [o.name, locationText(o), ...o.members.flatMap((m) => [m.name ?? "", m.email])].join(" "),
  })

  return (
    <div className="px-page pb-8 pt-3.5">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="relative min-w-0 flex-[0_1_320px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={table.query}
                onChange={(e) => table.setQuery(e.target.value)}
                placeholder={tc("search")}
                className="pl-8"
              />
            </div>
            <span className="text-muted-foreground">{t("hint")}</span>
          </div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortableHead sortKey="name" sort={table.sort} onToggle={table.toggleSort}>
                  {t("colName")}
                </SortableHead>
                <SortableHead
                  sortKey="location"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  className="w-[36%]"
                >
                  {t("colLocation")}
                </SortableHead>
                <SortableHead
                  sortKey="members"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  align="right"
                  className="w-[118px]"
                >
                  {t("colMembers")}
                </SortableHead>
                <SortableHead
                  sortKey="research"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  align="right"
                  className="w-[118px]"
                >
                  {t("colResearch")}
                </SortableHead>
                <SortableHead
                  sortKey="created"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  className="w-[124px]"
                >
                  {t("colCreated")}
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.length === 0 ? (
                <TableEmpty colSpan={5}>
                  {orgs.length === 0 ? t("empty") : tc("noResults")}
                </TableEmpty>
              ) : (
                table.rows.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(o.id)}
                  >
                    <TableCell>
                      <Truncate className="max-w-full font-semibold">{o.name}</Truncate>
                      {o.deactivatedAt && (
                        <span className="block text-[13px] text-muted-foreground">
                          {t("deactivatedBadge")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={locationText(o) ? undefined : "text-muted-foreground"}>
                      <Truncate className="max-w-full">
                        {locationText(o) || t("noLocation")}
                      </Truncate>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{o.members.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.researchCount}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(o.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-[660px]">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              {selected &&
                [locationText(selected), selected.deactivatedAt ? t("deactivatedBadge") : null]
                  .filter(Boolean)
                  .join(" · ")}
            </DialogDescription>
          </DialogHeader>

          {selected && <OrgMembers org={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
