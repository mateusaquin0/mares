"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

function DialogCloseButton() {
  const tc = useTranslations("common")
  return (
    <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
      <X className="h-4 w-4" aria-hidden />
      <span className="sr-only">{tc("close")}</span>
    </DialogPrimitive.Close>
  )
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    dirty?: boolean
    // Esconde o X do canto para o diálogo pôr o seu próprio no lugar certo — o caso do
    // diálogo de ticket, onde o fechar faz parte da linha de cabeçalho, ao lado do status.
    hideClose?: boolean
  }
>(({ className, children, dirty, hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 flex max-h-[90dvh] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-hidden overscroll-contain rounded-sm border border-foreground bg-popover px-5 pb-4 pt-3.5 shadow-dialog duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className,
      )}
      onInteractOutside={(e) => {
        // Não fecha por: (a) formulário sujo; (b) interação num dropdown portalado para o body
        // (ex.: autocomplete de táxon) — que é "fora" do content mas parte da mesma UI.
        const target = e.detail.originalEvent.target as Element | null
        if (dirty || target?.closest("[data-dropdown-portal]")) e.preventDefault()
      }}
      onEscapeKeyDown={(e) => {
        if (dirty) e.preventDefault()
      }}
      {...props}
    >
      {children}
      {!hideClose && <DialogCloseButton />}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "-mx-5 flex shrink-0 flex-col gap-[3px] border-b border-foreground px-5 pb-2.5 pr-12 text-left",
      className,
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

// Corpo rolável do diálogo: só esta região rola, mantendo cabeçalho e rodapé sempre visíveis.
// Usar em formulários altos, entre o DialogHeader e o DialogFooter.
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto", className)} {...props} />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex shrink-0 flex-row flex-wrap justify-end gap-2", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-serif text-[22px] font-medium leading-[26px]", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
