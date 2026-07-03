"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Field } from "./field";

// Campo de texto controlado: Label + Input + erro. `onChange` recebe o valor (string).
// Aceita as demais props do Input (type, step, placeholder, className…).
export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  optional,
  ...inputProps
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  optional?: boolean;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <Field htmlFor={id} label={label} error={error} optional={optional}>
      <Input
        id={id}
        value={value}
        aria-invalid={!!error || undefined}
        onChange={(e) => onChange(e.target.value)}
        {...inputProps}
      />
    </Field>
  );
}
