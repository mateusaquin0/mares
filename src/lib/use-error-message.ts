"use client"

import { useTranslations } from "next-intl"
import { KNOWN_ERROR_CODES } from "@/lib/error-codes"

// Traduz a resposta de erro de uma API: se vier um `code` conhecido, usa a tradução do
// namespace `errors`; senão cai para a mensagem literal do servidor. Ver docs/I18N.md.
export function useErrorMessage() {
  const te = useTranslations("errors")
  return (body: unknown): string | undefined => {
    const b = body as { code?: string; error?: unknown } | null
    if (b?.code && KNOWN_ERROR_CODES.has(b.code)) return te(b.code)
    return typeof b?.error === "string" ? b.error : undefined
  }
}
