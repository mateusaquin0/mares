"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"

import { Label, RequiredMark } from "@/components/ui/label"

export { RequiredMark }

// Mensagem de erro de um campo. Traduz a chave do namespace `validation`; se não
// for uma chave conhecida, mostra o texto como veio.
export function FieldError({ msg }: { msg?: string }) {
  const tval = useTranslations("validation")
  if (!msg) return null
  return <p className="text-xs text-destructive">{tval.has(msg) ? tval(msg) : msg}</p>
}

// Envolve um controle de formulário com rótulo (+ "*" quando obrigatório) e mensagem de erro.
// Reutilizável por qualquer campo — os *Field abaixo apenas plugam o controle.
export function Field({
  htmlFor,
  label,
  error,
  required,
  children,
}: {
  htmlFor?: string
  label: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      <FieldError msg={error} />
    </div>
  )
}
