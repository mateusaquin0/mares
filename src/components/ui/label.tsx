"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

// "*" ao lado do rótulo de campos obrigatórios.
export function RequiredMark() {
  const tc = useTranslations("common")
  return (
    <span className="text-destructive" title={tc("required")} aria-hidden>
      *
    </span>
  )
}

const labelVariants = cva(
  "text-[13px] font-semibold leading-4 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants> & { required?: boolean }
>(({ className, required, ...props }, ref) => (
  // O "*" de obrigatório é desenhado por CSS: fica fora do texto do rótulo, que continua sendo
  // exatamente o nome do campo para leitores de tela e para os testes.
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      labelVariants(),
      required && "after:ml-1 after:text-destructive after:content-['*']",
      className,
    )}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
