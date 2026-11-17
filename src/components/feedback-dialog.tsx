"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Lightbulb, Bug } from "lucide-react"

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

  const typeOptions: { value: FeedbackTypeValue; label: string; icon: typeof Lightbulb }[] = [
    { value: "SUGGESTION", label: t("typeSuggestion"), icon: Lightbulb },
    { value: "BUG", label: t("typeBug"), icon: Bug },
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

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("typeLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    type === value
                      ? "border-primary bg-accent font-medium text-accent-foreground"
                      : "border-border text-foreground/70 hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="feedback-title">{t("titleLabel")}</Label>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="feedback-message">{t("messageLabel")}</Label>
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

          <div className="space-y-2">
            <FeedbackImagePreviews files={files} onChange={setFiles} ns="feedback" />
            <FeedbackImagePicker
              files={files}
              onChange={setFiles}
              remaining={FEEDBACK_ATTACHMENT_MAX_PER_TICKET - files.length}
              ns="feedback"
              disabled={createM.isPending}
            />
          </div>

          <DialogFooter>
            {/* Atalho para acompanhar o que já foi enviado (status + resposta). */}
            <Link
              href="/app/feedback"
              onClick={() => onOpenChange(false)}
              className="mr-auto self-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("seeMine")}
            </Link>
            <Button
              type="button"
              variant="ghost"
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
