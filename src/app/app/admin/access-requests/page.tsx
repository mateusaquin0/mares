"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useErrorMessage } from "@/lib/use-error-message"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type JoinRequest = {
  id: string
  email: string
  requesterName: string
  organizationName: string
  status: string
  createdAt: string
}

export default function AccessRequestsPage() {
  const t = useTranslations("adminRequests")
  const tc = useTranslations("common")
  const em = useErrorMessage()
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/access-requests?status=PENDING")
    if (res.ok) setRequests(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(id: string, action: "approve" | "reject") {
    setBusy(`${id}:${action}`)
    const res = await fetch(`/api/admin/access-requests/${id}/${action}`, { method: "POST" })
    setBusy(null)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(t("opError"), { description: em(body) })
      return
    }
    toast.success(action === "approve" ? t("approved") : t("rejected"))
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colOrg")}</TableHead>
                <TableHead>{t("colRequester")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead className="w-48 text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.organizationName}</TableCell>
                  <TableCell>{r.requesterName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy?.startsWith(r.id + ":")}
                        loading={busy === `${r.id}:reject`}
                        onClick={() => act(r.id, "reject")}
                      >
                        {t("reject")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy?.startsWith(r.id + ":")}
                        loading={busy === `${r.id}:approve`}
                        onClick={() => act(r.id, "approve")}
                      >
                        {t("approve")}
                      </Button>
                    </div>
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
