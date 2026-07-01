// MARES — Configuração de internacionalização (i18n).
// Estratégia: locale por cookie, sem prefixo de URL (ver docs/I18N.md).

export const locales = ["pt", "en"] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "pt"

export const LOCALE_COOKIE = "NEXT_LOCALE"

export const localeNames: Record<Locale, string> = {
  pt: "Português",
  en: "English",
}

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}
