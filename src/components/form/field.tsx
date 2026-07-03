"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";

// "(opcional)" ao lado do rótulo de campos não obrigatórios.
export function OptionalHint() {
  const tc = useTranslations("common");
  return (
    <span className="font-normal text-muted-foreground">({tc("optional")})</span>
  );
}

// Mensagem de erro de um campo. Traduz a chave do namespace `validation`; se não
// for uma chave conhecida, mostra o texto como veio.
export function FieldError({ msg }: { msg?: string }) {
  const tval = useTranslations("validation");
  if (!msg) return null;
  return (
    <p className="text-xs text-destructive">{tval.has(msg) ? tval(msg) : msg}</p>
  );
}

// Envolve um controle de formulário com rótulo (+ "(opcional)") e mensagem de erro.
// Reutilizável por qualquer campo — os *Field abaixo apenas plugam o controle.
export function Field({
  htmlFor,
  label,
  error,
  optional,
  children,
}: {
  htmlFor?: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>
        {label} {optional && <OptionalHint />}
      </Label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}
