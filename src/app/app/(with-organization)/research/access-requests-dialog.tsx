"use client"

// MARES — Pedidos de acesso às pesquisas que o usuário gere (admin da org ou criador).
//
// Fica como um botão ao lado de "Nova pesquisa" e abre o modal com a fila. O botão só é
// renderizado quando há o que responder — sem pendência não há botão morto no cabeçalho
// (a bolinha do menu lateral continua sendo o aviso passivo). Aprovar aqui é exatamente
// criar o vínculo ResearchMember. Ver docs/PERMISSOES.md.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Inbox, X } from "lucide-react"

import { useAccessRequests, useReviewAccessRequest } from "@/hooks/use-research"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function AccessRequestsDialog() {
  const t = useTranslations("research")
  const em = useErrorMessage()
  const requestsQ = useAccessRequests()
  const reviewM = useReviewAccessRequest()
  const [open, setOpen] = useState(false)

  const items = requestsQ.data ?? []
  if (items.length === 0) return null

  async function review(id: string, action: "approve" | "reject") {
    try {
      await reviewM.mutateAsync({ id, action })
      toast.success(action === "approve" ? t("accessApproved") : t("accessRejectedDone"))
      // Fecha ao esvaziar a fila: sem isso o modal fica com um estado vazio inútil.
      if (items.length === 1) setOpen(false)
    } catch (err) {
      toast.error(t("accessReviewError"), { description: em(err) })
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Inbox className="size-4" />
        {t("accessQueueButton", { count: items.length })}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Mais largo que o padrão (max-w-lg): cada linha é uma frase + duas ações, que no
            tamanho padrão quebram em três linhas. */}
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("accessQueueTitle")}</DialogTitle>
            <DialogDescription>{t("accessQueueDesc")}</DialogDescription>
          </DialogHeader>
          {/* DialogBody: a fila pode ter muitos pedidos — só a lista rola, o cabeçalho fica. */}
          <DialogBody>
            <ul className="divide-y">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {t("accessQueueLine", {
                        user: r.user.name || r.user.email,
                        research: r.research.name,
                      })}
                    </p>
                    {r.message && <p className="text-xs text-muted-foreground">{r.message}</p>}
                  </div>
                  {/* shrink-0: a folga sobra para o texto, não para as ações. */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review(r.id, "approve")}
                      disabled={reviewM.isPending}
                    >
                      <Check className="size-4" />
                      {t("accessApprove")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => review(r.id, "reject")}
                      disabled={reviewM.isPending}
                    >
                      <X className="size-4" />
                      {t("accessReject")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
