"use client"

import { useTranslations } from "next-intl"
import { KNOWN_ERROR_CODES } from "@/lib/error-codes"
import { ApiError } from "@/lib/http"

// Traduz a resposta de erro de uma API: se vier um `code` conhecido, usa a tradução do
// namespace `errors`; senão cai para a mensagem literal do servidor. Ver docs/I18N.md.
// Aceita tanto o corpo de erro (`{ error, code }`) quanto um ApiError capturado.
export function useErrorMessage() {
  const te = useTranslations("errors")
  return (input: unknown): string | undefined => {
    const b = (input instanceof ApiError ? input.body : input) as
      | { code?: string; error?: unknown }
      | null
    if (b?.code && KNOWN_ERROR_CODES.has(b.code)) return te(b.code)
    return typeof b?.error === "string" ? b.error : undefined
  }
}
