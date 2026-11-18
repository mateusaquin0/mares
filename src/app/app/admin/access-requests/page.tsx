"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

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
import { Truncate } from "@/components/ui/truncate"
import { ReloadButton } from "@/components/ui/reload-button"

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
    <div className="px-page pb-8 pt-3.5">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          <p className="py-2.5 text-muted-foreground">
            {requests.length > 0 ? t("count", { count: requests.length }) : " "}
          </p>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[38%]">{t("colOrg")}</TableHead>
                <TableHead>{t("colRequester")}</TableHead>
                <TableHead className="w-[28%]">{t("colEmail")}</TableHead>
                <TableHead className="w-[190px] text-right">
                  <ReloadButton />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && <TableEmpty colSpan={4}>{t("empty")}</TableEmpty>}
              {requests.map((r) => {
                const isBusy = !!busy?.startsWith(r.id + ":")
                return (
                  <TableRow key={r.id} className="hover:bg-transparent">
                    <TableCell className="font-semibold">
                      <Truncate className="max-w-full">{r.organizationName}</Truncate>
                    </TableCell>
                    <TableCell>
                      <Truncate className="max-w-full">{r.requesterName}</Truncate>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Truncate className="max-w-full">{r.email}</Truncate>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-[26px]"
                          disabled={isBusy}
                          loading={busy === `${r.id}:reject`}
                          onClick={() => act(r.id, "reject")}
                        >
                          {t("reject")}
                        </Button>
                        <Button
                          size="sm"
                          className="h-[26px]"
                          disabled={isBusy}
                          loading={busy === `${r.id}:approve`}
                          onClick={() => act(r.id, "approve")}
                        >
                          {t("approve")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
