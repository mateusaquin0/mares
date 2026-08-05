"use client"

import type { ComponentProps } from "react"

import { Textarea } from "@/components/ui/textarea"
import { CharCounter } from "@/components/ui/char-counter"
import { Field } from "./field"

// Campo de texto multilinha controlado: Label + Textarea + erro.
// `max` (opcional): aplica `maxLength` e mostra um contador de caracteres.
export function TextareaField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  max,
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  max?: number
} & Omit<ComponentProps<typeof Textarea>, "id" | "value" | "onChange">) {
  return (
    <Field htmlFor={id} label={label} error={error} required={required}>
      <Textarea
        id={id}
        value={value}
        maxLength={max}
        aria-invalid={!!error || undefined}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
      {max != null && (
        <div className="text-right">
          <CharCounter value={value} max={max} />
        </div>
      )}
    </Field>
  )
}
