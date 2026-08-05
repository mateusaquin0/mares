"use client"

// MARES — Compartilhamentos de indivíduo aguardando resposta do usuário.
//
// Botão ao lado de "Novo animal" que abre a fila. Mostra os dois sentidos
// (ver docs/PERMISSOES.md §Compartilhamento de indivíduo):
//   • CONVITE — outra pesquisa ofereceu um indivíduo a uma pesquisa sua;
//   • PEDIDO  — alguém quer estudar um indivíduo cuja pesquisa primária é sua.
//
// Em ambos, quem responde é o lado que ainda não consentiu, e só o aceite dá visibilidade —
// até lá a outra pesquisa não enxerga nada do indivíduo. O botão some quando não há
// pendência (a bolinha do menu lateral é o aviso passivo).

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Share2, X } from "lucide-react"

import {
  usePendingShares,
  useAcceptAnimalShare,
  useRemoveAnimalResearch,
} from "@/hooks/use-animals"
import { useErrorMessage } from "@/lib/use-error-message"
import type { PendingShare } from "@/types/animal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function PendingSharesDialog() {
  const t = useTranslations("animals")
  const sharesQ = usePendingShares()
  const [open, setOpen] = useState(false)

  const items = sharesQ.data ?? []
  if (items.length === 0) return null

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 className="size-4" />
        {t("sharesQueueButton", { count: items.length })}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Mais largo que o padrão (max-w-lg): cada linha é um selo + uma frase + duas
            ações, que no tamanho padrão quebram em três linhas. */}
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("sharesQueueTitle")}</DialogTitle>
            <DialogDescription>{t("sharesQueueDesc")}</DialogDescription>
          </DialogHeader>
          {/* DialogBody: a fila pode ter muitas pendências — só a lista rola, o cabeçalho fica. */}
          <DialogBody>
            <ul className="divide-y">
              {items.map((s) => (
                <ShareRow
                  key={`${s.animal.id}:${s.research.id}`}
                  share={s}
                  onDone={() => items.length === 1 && setOpen(false)}
                />
              ))}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ShareRow({ share, onDone }: { share: PendingShare; onDone: () => void }) {
  const t = useTranslations("animals")
  const em = useErrorMessage()
  const acceptM = useAcceptAnimalShare(share.animal.id)
  const rejectM = useRemoveAnimalResearch(share.animal.id)
  const busy = acceptM.isPending || rejectM.isPending

  // Identificação do indivíduo: ID de controle, SIMBA ou espécie — o que houver.
  const label =
    share.animal.controlId || share.animal.simbaRecordNumber || share.animal.species || "—"
  const isInvite = share.origin === "INVITE"

  async function respond(accept: boolean) {
    try {
      if (accept) await acceptM.mutateAsync(share.research.id)
      else await rejectM.mutateAsync(share.research.id)
      toast.success(accept ? t("shareAccepted") : t("shareRejected"))
      onDone()
    } catch (err) {
      toast.error(t("shareError"), { description: em(err) })
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Badge variant="outline" className="shrink-0">
        {isInvite ? t("shareInviteTag") : t("shareRequestTag")}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {isInvite
            ? // "A pesquisa X ofereceu o indivíduo Y à sua pesquisa Z"
              t("shareInviteLine", {
                animal: label,
                from: share.fromResearch.name,
                to: share.research.name,
              })
            : // "Fulano quer o indivíduo Y (da sua pesquisa) para a pesquisa Z"
              t("shareRequestLine", {
                animal: label,
                user: share.invitedBy?.name || share.invitedBy?.email || "—",
                to: share.research.name,
              })}
        </p>
        {share.message && <p className="text-xs text-muted-foreground">{share.message}</p>}
      </div>
      {/* shrink-0: a folga sobra para o texto, não para as ações. */}
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => respond(true)} disabled={busy}>
          <Check className="size-4" />
          {t("shareAccept")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => respond(false)} disabled={busy}>
          <X className="size-4" />
          {t("shareReject")}
        </Button>
      </div>
    </li>
  )
}
