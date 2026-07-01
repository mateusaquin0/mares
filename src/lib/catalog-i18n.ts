// MARES — Resolve um rótulo de catálogo no idioma ativo (client-safe).
// Aceita string simples (ex.: nome científico de patógeno) ou objeto { pt, en }
// (ex.: órgão/exame e grupo do patógeno).

export type I18nText = { pt?: string | null; en?: string | null }

export function txt(
  locale: string,
  value: string | I18nText | null | undefined
): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  return (locale === "en" ? value.en || value.pt : value.pt || value.en) ?? ""
}
