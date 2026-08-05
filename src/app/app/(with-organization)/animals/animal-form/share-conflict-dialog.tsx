"use client"

// MARES — Identificador já usado por um indivíduo de outra pesquisa.
//
// Este é o ponto em que a pessoa descobre que o indivíduo já existe no grupo, e ela tem
// exatamente duas saídas possíveis:
//
//   • é o MESMO indivíduo  → pedir que a pesquisa de origem o compartilhe (o cadastro não se
//     repete: o indivíduo é um só, com amostras de cada pesquisa);
//   • é OUTRO indivíduo    → o identificador foi digitado errado; ela fecha e corrige.
//
// Por isso mostramos a identidade mínima do registro existente (espécie, data do evento,
// local): sem ela a escolha acima é um chute. São dados de identificação do indivíduo
// físico — amostras e análises da outra pesquisa continuam inacessíveis.
//
// Vive DENTRO do modal do formulário: o Dialog do Radix bloqueia cliques fora dele, então
// uma ação em toast não funcionaria aqui.

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"

import { formatDateOnly } from "@/lib/date"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ShareConflict, VisibleConflict } from "./use-animal-form"

export function ShareConflictDialog({
  conflict,
  researchName,
  onClose,
  onRequest,
}: {
  conflict: ShareConflict
  // Pesquisa escolhida no formulário — a que receberá o indivíduo, se o pedido for aceito.
  researchName: string
  onClose: () => void
  onRequest: () => Promise<void>
}) {
  const t = useTranslations("animals")
  const locale = useLocale()
  const [pending, setPending] = React.useState(false)

  const na = t("notInformed")
  const rows = [
    { label: t("species"), value: conflict.species || t("speciesUndetermined") },
    {
      label: t("eventDate"),
      value: conflict.eventDate ? formatDateOnly(conflict.eventDate, locale) : na,
    },
    { label: t("location"), value: conflict.location || na },
    { label: t("shareConflictOwner"), value: conflict.research },
  ]

  async function request() {
    try {
      setPending(true)
      await onRequest()
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("shareConflictTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("shareConflictDesc", { research: conflict.research, to: researchName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("shareConflictExisting")}
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className="text-sm">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{t("shareConflictHint")}</p>
        </div>

        {/* Sem pesquisa de destino não há a quem entregar o indivíduo: acontece quando a
            lupa é usada antes de escolher a pesquisa (grupo com várias). */}
        {!researchName && (
          <p className="text-xs text-muted-foreground">{t("shareConflictSelectResearch")}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("shareConflictFix")}</AlertDialogCancel>
          <button
            type="button"
            disabled={pending || !researchName}
            onClick={request}
            className={cn(buttonVariants(), "disabled:pointer-events-none disabled:opacity-50")}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {t("shareRequestAction")}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Identificador de um indivíduo que o usuário JÁ enxerga: nada a pedir — a saída é abrir o
// registro existente. Nova aba, para o formulário meio preenchido não se perder.
export function VisibleConflictDialog({
  conflict,
  onClose,
}: {
  conflict: VisibleConflict
  onClose: () => void
}) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("idFoundTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("idTakenIn", { research: conflict.research })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("close")}</AlertDialogCancel>
          <a
            href={`/app/animals/${conflict.animalId}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants())}
            onClick={onClose}
          >
            {t("idFoundOpen")}
          </a>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
