"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"

import { useMyFeedback, useReopenMyFeedback, useUpdateMyFeedback } from "@/hooks/use-feedback"
import { useErrorMessage } from "@/lib/use-error-message"
import {
  FEEDBACK_MESSAGE_BODY_MAX,
  FEEDBACK_REOPEN_MIN,
  type FeedbackTypeValue,
} from "@/schemas/feedback.schema"
import { FeedbackStatusBadge, FeedbackTypeBadge } from "@/components/feedback-badges"
import { ThreadSummaryCell } from "@/components/feedback-thread"
import { FeedbackTicketDialog } from "@/components/feedback-ticket-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ReloadButton } from "@/components/ui/reload-button"
import { Truncate } from "@/components/ui/truncate"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function MyFeedback() {
  const t = useTranslations("myFeedback")
  const locale = useLocale()

  const em = useErrorMessage()
  const listQ = useMyFeedback()
  const items = listQ.data ?? []
  // Guarda o id: assim o diálogo reflete o item recarregado depois de salvar uma correção.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? (items.find((f) => f.id === selectedId) ?? null) : null

  // Correção do próprio relato — o diálogo só a oferece enquanto o status é NEW.
  const updateM = useUpdateMyFeedback()

  async function saveEdit(draft: { type: FeedbackTypeValue; title: string; message: string }) {
    if (!selectedId) return
    try {
      await updateM.mutateAsync({ id: selectedId, ...draft })
      toast.success(t("saved"))
    } catch (err) {
      // Inclui o caso de corrida: o admin triou entre abrir a edição e salvar.
      toast.error(t("saveError"), { description: em(err) })
      throw err
    }
  }

  // Reabertura de um ticket encerrado: exige justificativa, então passa por um diálogo
  // próprio (nunca em um clique), como o descarte do lado da administração.
  const reopenM = useReopenMyFeedback()
  const [reopenId, setReopenId] = useState<string | null>(null)
  const [reopenReason, setReopenReason] = useState("")
  const reopenTooShort = reopenReason.trim().length < FEEDBACK_REOPEN_MIN

  async function confirmReopen() {
    if (!reopenId || reopenTooShort) return
    try {
      await reopenM.mutateAsync({ id: reopenId, reason: reopenReason.trim() })
      toast.success(t("reopened"))
      setReopenId(null)
      setReopenReason("")
    } catch (err) {
      toast.error(t("reopenError"), { description: em(err) })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-center">{t("colType")}</TableHead>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead className="w-32">{t("colDate")}</TableHead>
                <TableHead className="w-20 text-center">{t("colStatus")}</TableHead>
                <TableHead className="w-24">{t("colThread")}</TableHead>
                <TableHead className="w-16 text-right">
                  <ReloadButton
                    onReload={async () => {
                      await listQ.refetch()
                    }}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>}
              {items.map((f) => (
                <TableRow
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className="cursor-pointer"
                  title={t("viewDetails")}
                >
                  <TableCell className="text-center">
                    <FeedbackTypeBadge type={f.type} ns="myFeedback" iconOnly />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Truncate className="max-w-[18rem]">{f.title}</Truncate>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(f.createdAt).toLocaleDateString(locale)}
                  </TableCell>
                  <TableCell className="text-center">
                    <FeedbackStatusBadge status={f.status} ns="myFeedback" iconOnly />
                  </TableCell>
                  <TableCell>
                    <ThreadSummaryCell summary={f} ns="myFeedback" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FeedbackTicketDialog
        ns="myFeedback"
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null)
        }}
        ticket={
          selected && {
            ...selected,
            // O autor é o próprio usuário, e a anotação interna nunca sai do servidor.
            authorName: null,
            authorEmail: null,
            adminNote: null,
          }
        }
        author={{
          onSaveEdit: saveEdit,
          saving: updateM.isPending,
          onReopen: () => {
            setReopenId(selectedId)
            setReopenReason("")
          },
        }}
      />

      {/* Reabertura: só conclui com justificativa, que vira a primeira mensagem da conversa. */}
      <Dialog
        open={!!reopenId}
        onOpenChange={(o) => {
          if (o) return
          setReopenId(null)
          setReopenReason("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reopenTitle")}</DialogTitle>
            <DialogDescription>{t("reopenDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reopen-reason">{t("messageLabel")}</Label>
              <span className="text-xs text-muted-foreground">
                {reopenReason.trim().length}/{FEEDBACK_MESSAGE_BODY_MAX}
              </span>
            </div>
            <Textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder={t("reopenPlaceholder")}
              maxLength={FEEDBACK_MESSAGE_BODY_MAX}
              rows={4}
              autoFocus
            />
            {reopenTooShort && (
              <p className="text-xs text-muted-foreground">
                {t("reopenMin", { min: FEEDBACK_REOPEN_MIN })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopenId(null)} disabled={reopenM.isPending}>
              {t("cancel")}
            </Button>
            <Button
              className="gap-1.5"
              onClick={confirmReopen}
              loading={reopenM.isPending}
              disabled={reopenTooShort}
            >
              <RotateCcw className="size-4" />
              {t("reopenConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
