"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// Diálogo de confirmação reutilizável (substitui window.confirm). Enquanto a ação assíncrona
// roda, o botão de confirmar exibe um spinner e o diálogo permanece aberto até concluir.
//
// Dois modos:
//  - Não controlado: passe `trigger` (o próprio componente gerencia abrir/fechar).
//  - Controlado: passe `open` + `onOpenChange` (útil para acionar a partir de um menu, onde
//    o item de menu fecha antes de um trigger interno funcionar).
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const tc = useTranslations("common")
  const confirmText = confirmLabel ?? tc("confirm")
  const cancelText = cancelLabel ?? tc("cancel")
  const isControlled = openProp !== undefined
  const [openState, setOpenState] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const open = isControlled ? openProp : openState

  function setOpen(o: boolean) {
    if (isControlled) onOpenChange?.(o)
    else setOpenState(o)
  }

  async function handleConfirm() {
    try {
      setPending(true)
      await onConfirm()
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelText}</AlertDialogCancel>
          {/* Botão próprio (não o AlertDialogAction) para não fechar antes de a ação concluir. */}
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirm}
            className={cn(
              buttonVariants(),
              destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmText}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
