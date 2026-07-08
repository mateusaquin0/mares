"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// Campo de senha com botão para mostrar/ocultar. Encaminha a ref (compatível com o
// `register` do react-hook-form) e repassa todas as props ao <Input>.
export const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false)
    const tc = useTranslations("common")

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? tc("hidePassword") : tc("showPassword")}
          aria-pressed={show}
          // tabIndex -1: não interrompe o fluxo de tab entre os campos do formulário.
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = "PasswordInput"
