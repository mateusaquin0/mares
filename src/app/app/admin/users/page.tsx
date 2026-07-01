"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useErrorMessage } from "@/lib/use-error-message"
import { useTable } from "@/lib/use-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SortableHead } from "@/components/ui/sortable-head"

type AdminUser = {
  id: string
  email: string
  name: string | null
  isSystemAdmin: boolean
  status: string
  memberships: { orgId: string; orgName: string; role: string }[]
}

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const orgsText = useCallback(
    (u: AdminUser) =>
      u.memberships.length === 0
        ? t("noOrg")
        : u.memberships
            .map(
              (m) =>
                `${m.orgName} (${
                  m.role === "ORG_ADMIN" ? tc("roleAdmin") : tc("roleResearcher")
                })`
            )
            .join(" · "),
    [t, tc]
  )

  const table = useTable(users, {
    locale,
    initialSort: { key: "name" },
    columns: {
      name: (u) => u.name ?? "",
      email: (u) => u.email,
      orgs: (u) => orgsText(u),
      status: (u) => u.status,
    },
    search: (u) => [u.name ?? "", u.email, orgsText(u), u.status].join(" "),
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/users")
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function remove(u: AdminUser) {
    setBusy(u.id)
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" })
    setBusy(null)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(t("deleteError"), { description: em(body) })
      return
    }
    toast.success(t("deleted"))
    setUsers((prev) => prev.filter((x) => x.id !== u.id))
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
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
                  <SortableHead sortKey="email" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colEmail")}
                  </SortableHead>
                  <SortableHead sortKey="orgs" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colOrgs")}
                  </SortableHead>
                  <SortableHead sortKey="status" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colStatus")}
                  </SortableHead>
                  <TableHead className="w-24 text-right">{t("colActions")}</TableHead>
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
                  table.rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {u.name ?? "—"}
                      {u.isSystemAdmin && (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          {t("globalAdmin")}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{orgsText(u)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDialog
                      title={t("deleteTitle")}
                      description={t("deleteDesc", { email: u.email })}
                      confirmLabel={tc("delete")}
                      destructive
                      onConfirm={() => remove(u)}
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === u.id || u.isSystemAdmin}
                        >
                          {tc("delete")}
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
