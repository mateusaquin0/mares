"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field } from "./field"

export type SelectOption = { value: string; label: string }

// Campo de seleção controlado: Label + Select + erro. As opções vêm como dados
// (não JSX), o que mantém o campo declarativo e reutilizável.
export function SelectField({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  optional,
}: {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  error?: string
  optional?: boolean
}) {
  return (
    <Field htmlFor={id} label={label} error={error} optional={optional}>
      <Select value={value || undefined} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-invalid={!!error || undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
