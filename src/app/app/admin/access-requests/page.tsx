"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableSkeleton } from "@/components/ui/skeleton"
import { useErrorMessage } from "@/lib/use-error-message"
import { useAccessRequests, useActOnRequest } from "@/hooks/use-admin"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ReloadButton } from "@/components/ui/reload-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function AccessRequestsPage() {
  const t = useTranslations("adminRequests")
  const em = useErrorMessage()
  const requestsQ = useAccessRequests()
  const requests = requestsQ.data ?? []
  const loading = requestsQ.isLoading
  const actM = useActOnRequest()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(id: string, action: "approve" | "reject") {
    setBusy(`${id}:${action}`)
    try {
      await actM.mutateAsync({ id, action })
      toast.success(action === "approve" ? t("approved") : t("rejected"))
    } catch (err) {
      toast.error(t("opError"), { description: em(err) })
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
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colOrg")}</TableHead>
                <TableHead>{t("colRequester")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead className="w-48 text-right">
                  <ReloadButton />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && <TableEmpty colSpan={4}>{t("empty")}</TableEmpty>}
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.organizationName}</TableCell>
                  <TableCell>{r.requesterName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      const isBusy = !!busy?.startsWith(r.id + ":")
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={isBusy}
                              loading={isBusy}
                            >
                              {!isBusy && <MoreHorizontal className="size-4" />}
                              <span className="sr-only">{t("colActions")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => act(r.id, "approve")}>
                              {t("approve")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => act(r.id, "reject")}>
                              {t("reject")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )
                    })()}
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
