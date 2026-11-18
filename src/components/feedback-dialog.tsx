"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { useCreateFeedback } from "@/hooks/use-feedback"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TITLE_MAX,
  type FeedbackTypeValue,
} from "@/schemas/feedback.schema"
import { FEEDBACK_ATTACHMENT_MAX_PER_TICKET } from "@/lib/feedback-media"
import { FeedbackImagePicker, FeedbackImagePreviews } from "@/components/feedback-image-picker"

// Diálogo para enviar sugestão ou relatar bug (usuário autenticado). Aberto pela navegação
// do topo, que controla `open`.
export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("feedback")
  const em = useErrorMessage()
  const pathname = usePathname()
  const createM = useCreateFeedback()

  const [type, setType] = useState<FeedbackTypeValue>("SUGGESTION")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  // Prints do bug / mockups da sugestão, enviados junto com o relato.
  const [files, setFiles] = useState<File[]>([])

  function reset() {
    setType("SUGGESTION")
    setTitle("")
    setMessage("")
    setFiles([])
  }

  const canSubmit = !!title.trim() && !!message.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      const { failedUploads } = await createM.mutateAsync({
        type,
        title: title.trim(),
        message: message.trim(),
        pageUrl: pathname,
        files,
      })
      // O relato já foi enviado mesmo que alguma imagem não suba: avisa, mas não trata
      // como falha do envio.
      if (failedUploads > 0) toast.warning(t("attachError"))
      else toast.success(t("sent"))
      onOpenChange(false)
      reset()
    } catch (err) {
      toast.error(t("sendError"), { description: em(err) })
    }
  }

  const typeOptions: { value: FeedbackTypeValue; label: string }[] = [
    { value: "SUGGESTION", label: t("typeSuggestion") },
    { value: "BUG", label: t("typeBug") },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-2.5">
          <div className="space-y-0.5">
            <Label id="feedback-type-label">{t("typeLabel")}</Label>
            <div
              role="group"
              aria-labelledby="feedback-type-label"
              className="flex w-fit rounded-sm border border-input"
            >
              {typeOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={cn(
                    "px-3.5 py-1 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    type === value
                      ? "bg-foreground font-semibold text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="feedback-title" required>
                {t("titleLabel")}
              </Label>
              <span className="text-xs text-muted-foreground">
                {title.length}/{FEEDBACK_TITLE_MAX}
              </span>
            </div>
            <Input
              id="feedback-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              maxLength={FEEDBACK_TITLE_MAX}
              required
            />
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="feedback-message" required>
                {t("messageLabel")}
              </Label>
              <span className="text-xs text-muted-foreground">
                {message.length}/{FEEDBACK_MESSAGE_MAX}
              </span>
            </div>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePlaceholder")}
              maxLength={FEEDBACK_MESSAGE_MAX}
              rows={5}
              required
            />
          </div>

          <div className="space-y-1.5">
            <FeedbackImagePicker
              asField
              files={files}
              onChange={setFiles}
              remaining={FEEDBACK_ATTACHMENT_MAX_PER_TICKET - files.length}
              ns="feedback"
              disabled={createM.isPending}
            />
            <FeedbackImagePreviews files={files} onChange={setFiles} ns="feedback" />
          </div>

          <DialogFooter>
            {/* Atalho para acompanhar o que já foi enviado (status + resposta). */}
            <Button asChild variant="outline">
              <Link href="/app/feedback" onClick={() => onOpenChange(false)}>
                {t("seeMine")}
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createM.isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" loading={createM.isPending} disabled={!canSubmit}>
              {t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
