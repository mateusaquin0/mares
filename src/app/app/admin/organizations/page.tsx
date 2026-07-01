"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"

import { getCountryName } from "@/lib/countries"
import { CountryFlag } from "@/components/country-flag"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

  // Renderiza a localização com bandeira + nome do país (traduzido a partir do ISO2).
  function renderLocation(o: Pick<Org, "city" | "state" | "country">) {
    const parts = [o.city, o.state, getCountryName(o.country, locale)].filter(Boolean)
    if (parts.length === 0) return <span className="text-muted-foreground">{t("noLocation")}</span>
    return (
      <span className="flex items-center gap-1.5">
        <CountryFlag iso2={o.country} />
        {parts.join(", ")}
      </span>
    )
  }
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Org | null>(null)

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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colLocation")}</TableHead>
                  <TableHead className="text-right">{t("colMembers")}</TableHead>
                  <TableHead className="text-right">{t("colResearch")}</TableHead>
                  <TableHead>{t("colCreated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((o) => (
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
                ))}
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
