// MARES — Lista de países (offline, internacionalizada) via i18n-iso-countries.
// Os nomes vêm em pt/en; as bandeiras são renderizadas pelo CSS flag-icons (ver
// src/components/country-flag.tsx). Os estados/cidades vêm da CSC (proxy /api/geo).

import countries from "i18n-iso-countries"
import ptLocale from "i18n-iso-countries/langs/pt.json"
import enLocale from "i18n-iso-countries/langs/en.json"

// registerLocale é idempotente (singleton) — seguro chamar na importação.
countries.registerLocale(ptLocale as Parameters<typeof countries.registerLocale>[0])
countries.registerLocale(enLocale as Parameters<typeof countries.registerLocale>[0])

export type Country = { iso2: string; name: string }

function lang(locale: string) {
  return locale === "pt" ? "pt" : "en"
}

export function getCountries(locale: string): Country[] {
  const l = lang(locale)
  const names = countries.getNames(l)
  return Object.entries(names)
    .map(([iso2, name]) => ({ iso2, name }))
    .sort((a, b) => a.name.localeCompare(b.name, l))
}

export function getCountryName(iso2: string | null | undefined, locale: string): string {
  if (!iso2) return ""
  return countries.getName(iso2, lang(locale)) ?? iso2
}
