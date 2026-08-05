"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MessageSquarePlus, Lightbulb, Bug } from "lucide-react"

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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TITLE_MAX,
  type FeedbackTypeValue,
} from "@/schemas/feedback.schema"

// Botão + diálogo para enviar sugestão ou relatar bug (usuário autenticado).
// Fica no rodapé da sidebar; `collapsed` esconde o rótulo.
export function FeedbackDialog({ collapsed }: { collapsed?: boolean }) {
  const t = useTranslations("feedback")
  const em = useErrorMessage()
  const pathname = usePathname()
  const createM = useCreateFeedback()

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackTypeValue>("SUGGESTION")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")

  function reset() {
    setType("SUGGESTION")
    setTitle("")
    setMessage("")
  }

  const canSubmit = !!title.trim() && !!message.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await createM.mutateAsync({
        type,
        title: title.trim(),
        message: message.trim(),
        pageUrl: pathname,
      })
      toast.success(t("sent"))
      setOpen(false)
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
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          title={t("trigger")}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <MessageSquarePlus className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">{t("trigger")}</span>}
        </button>
      </DialogTrigger>

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

          <DialogFooter>
            {/* Atalho para acompanhar o que já foi enviado (status + resposta). */}
            <Link
              href="/app/feedback"
              onClick={() => setOpen(false)}
              className="mr-auto self-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("seeMine")}
            </Link>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
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
