// MARES — Escolhe o texto do catálogo conforme o idioma ativo (client-safe).
export function byLocale(
  locale: string,
  pt: string | null | undefined,
  en: string | null | undefined
): string {
  return (locale === "en" ? en || pt : pt || en) ?? ""
}
