"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"

import { getCountryName } from "@/lib/countries"
import { useTable } from "@/lib/use-table"
import { CountryFlag } from "@/components/country-flag"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SortableHead } from "@/components/ui/sortable-head"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type OrgMember = {
  userId: string
  name: string | null
  email: string
  status: string
  role: "ORG_ADMIN" | "RESEARCHER"
}

type Org = {
  id: string
  name: string
  city: string | null
  state: string | null
  country: string | null
  createdAt: string
  researchCount: number
  members: OrgMember[]
}

export default function AdminOrganizationsPage() {
  const t = useTranslations("adminOrgs")
  const tc = useTranslations("common")
  const locale = useLocale()

  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Org | null>(null)

  // Texto puro da localização (cidade, estado, país traduzido), usado em busca/ordenação.
  const locationText = useCallback(
    (o: Pick<Org, "city" | "state" | "country">) =>
      [o.city, o.state, getCountryName(o.country, locale)].filter(Boolean).join(", "),
    [locale]
  )

  // Renderiza a localização com bandeira + nome do país (traduzido a partir do ISO2).
  const renderLocation = useCallback(
    (o: Pick<Org, "city" | "state" | "country">) => {
      const text = locationText(o)
      if (!text) return <span className="text-muted-foreground">{t("noLocation")}</span>
      return (
        <span className="flex items-center gap-1.5">
          <CountryFlag iso2={o.country} />
          {text}
        </span>
      )
    },
    [locationText, t]
  )

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/organizations")
    if (res.ok) setOrgs(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
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
          <div className="rounded-md border">
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
                      onClick={() => setSelected(o)}
                    >
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {renderLocation(o)}
                      </TableCell>
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

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription asChild>
              <span>{selected && renderLocation(selected)}</span>
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("membersSection")}</p>
              {selected.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colUserName")}</TableHead>
                        <TableHead>{t("colUserEmail")}</TableHead>
                        <TableHead>{t("colUserRole")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.members.map((m) => (
                        <TableRow key={m.userId}>
                          <TableCell className="font-medium">{m.name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{m.email}</TableCell>
                          <TableCell>
                            <Badge
                              variant={m.role === "ORG_ADMIN" ? "default" : "secondary"}
                            >
                              {m.role === "ORG_ADMIN"
                                ? tc("roleAdmin")
                                : tc("roleResearcher")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
