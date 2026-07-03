"use client";

import type { ComponentProps } from "react";

import { Textarea } from "@/components/ui/textarea";
import { Field } from "./field";

// Campo de texto multilinha controlado: Label + Textarea + erro.
export function TextareaField({
  id,
  label,
  value,
  onChange,
  error,
  optional,
  ...props
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  optional?: boolean;
} & Omit<ComponentProps<typeof Textarea>, "id" | "value" | "onChange">) {
  return (
    <Field htmlFor={id} label={label} error={error} optional={optional}>
      <Textarea
        id={id}
        value={value}
        aria-invalid={!!error || undefined}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </Field>
  );
}
