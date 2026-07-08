"use client"

import { useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useErrorMessage } from "@/lib/use-error-message"
import { useTable } from "@/lib/use-table"
import { useAdminUsers, useRemoveUser } from "@/hooks/use-admin"
import type { AdminUser } from "@/types/admin"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SortableHead } from "@/components/ui/sortable-head"

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()
  const usersQ = useAdminUsers()
  const users = usersQ.data ?? []
  const loading = usersQ.isLoading
  const removeM = useRemoveUser()
  const [busy, setBusy] = useState<string | null>(null)

  const statusLabel = useCallback(
    (s: string) =>
      ({
        INVITED: t("statusInvited"),
        ACTIVE: t("statusActive"),
        DELETION_REQUESTED: t("statusDeletionRequested"),
      })[s] ?? s,
    [t],
  )

  const orgsText = useCallback(
    (u: AdminUser) =>
      u.memberships.length === 0
        ? t("noOrg")
        : u.memberships
            .map(
              (m) =>
                `${m.orgName} (${m.role === "ORG_ADMIN" ? tc("roleAdmin") : tc("roleResearcher")})`,
            )
            .join(" · "),
    [t, tc],
  )

  const table = useTable(users, {
    locale,
    initialSort: { key: "name" },
    columns: {
      name: (u) => u.name ?? "",
      email: (u) => u.email,
      orgs: (u) => orgsText(u),
      status: (u) => statusLabel(u.status),
    },
    search: (u) => [u.name ?? "", u.email, orgsText(u), statusLabel(u.status)].join(" "),
  })

  async function remove(u: AdminUser) {
    setBusy(u.id)
    try {
      await removeM.mutateAsync(u.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <TableSkeleton />
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
          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
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
                        <Badge variant="secondary">{statusLabel(u.status)}</Badge>
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
