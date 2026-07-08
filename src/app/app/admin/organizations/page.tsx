"use client"

import { useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"

import { getCountryName } from "@/lib/countries"
import { useTable } from "@/lib/use-table"
import { useAdminOrganizations } from "@/hooks/use-admin"
import type { AdminOrg } from "@/types/admin"
import { CountryFlag } from "@/components/country-flag"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { OrgMembers } from "./org-members"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
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

  // Renderiza a localização com bandeira + nome do país (traduzido a partir do ISO2).
  const renderLocation = useCallback(
    (o: Pick<AdminOrg, "city" | "state" | "country">) => {
      const text = locationText(o)
      if (!text) return <span className="text-muted-foreground">{t("noLocation")}</span>
      return (
        <span className="flex items-center gap-1.5">
          <CountryFlag iso2={o.country} />
          {text}
        </span>
      )
    },
    [locationText, t],
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
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <Input
            value={table.query}
            onChange={(e) => table.setQuery(e.target.value)}
            placeholder={tc("search")}
            className="max-w-sm"
          />
          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="name" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colName")}
                  </SortableHead>
                  <SortableHead sortKey="location" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colLocation")}
                  </SortableHead>
                  <SortableHead
                    sortKey="members"
                    sort={table.sort}
                    onToggle={table.toggleSort}
                    align="right"
                  >
                    {t("colMembers")}
                  </SortableHead>
                  <SortableHead
                    sortKey="research"
                    sort={table.sort}
                    onToggle={table.toggleSort}
                    align="right"
                  >
                    {t("colResearch")}
                  </SortableHead>
                  <SortableHead sortKey="created" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colCreated")}
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {tc("noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.rows.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(o.id)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {o.name}
                          {o.deactivatedAt && (
                            <Badge variant="secondary">{t("deactivatedBadge")}</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{renderLocation(o)}</TableCell>
                      <TableCell className="text-right">{o.members.length}</TableCell>
                      <TableCell className="text-right">{o.researchCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtDate(o.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription asChild>
              <span>{selected && renderLocation(selected)}</span>
            </DialogDescription>
          </DialogHeader>

          {selected && <OrgMembers org={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
