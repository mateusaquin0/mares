"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { getCountries } from "@/lib/countries"
import { useGeoStates, useGeoCities } from "@/hooks/use-geo"
import { CountryFlag } from "@/components/country-flag"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"

export type LocationValue = {
  // country = ISO 3166-1 alpha-2 (ex.: "BR"); state/city = nomes (rótulos exibidos).
  country?: string
  state?: string
  city?: string
}

// Seletor de localização em cascata: país → estado → cidade.
// País é offline (i18n + bandeiras); estado/cidade vêm do proxy /api/geo (CountryStateCity),
// com cache do React Query (staleTime infinito — dados praticamente estáticos).
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue
  onChange: (value: LocationValue) => void
}) {
  const locale = useLocale()
  const t = useTranslations("location")

  const countryOptions: ComboboxOption[] = React.useMemo(
    () =>
      getCountries(locale).map((c) => ({
        value: c.iso2,
        label: c.name,
        icon: <CountryFlag iso2={c.iso2} />,
      })),
    [locale],
  )

  const statesQuery = useGeoStates(value.country)

  const states = statesQuery.data ?? []
  // Estado é armazenado pelo NOME; derivamos o código (iso2) para buscar as cidades.
  const stateIso2 = states.find((s) => s.name === value.state)?.iso2

  const citiesQuery = useGeoCities(value.country, stateIso2)

  const stateOptions: ComboboxOption[] = states.map((s) => ({
    value: s.name,
    label: s.name,
  }))
  const cityOptions: ComboboxOption[] = (citiesQuery.data ?? []).map((c) => ({
    value: c.name,
    label: c.name,
  }))

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t("country")}</Label>
        <Combobox
          options={countryOptions}
          value={value.country}
          onChange={(country) => onChange({ country, state: undefined, city: undefined })}
          placeholder={t("countryPlaceholder")}
          searchPlaceholder={t("search")}
          emptyText={t("noResults")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("state")}</Label>
          <Combobox
            options={stateOptions}
            value={value.state}
            onChange={(state) => onChange({ ...value, state, city: undefined })}
            placeholder={t("statePlaceholder")}
            searchPlaceholder={t("search")}
            emptyText={statesQuery.isError ? t("loadError") : t("noResults")}
            disabled={!value.country}
            loading={statesQuery.isLoading}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("city")}</Label>
          <Combobox
            options={cityOptions}
            value={value.city}
            onChange={(city) => onChange({ ...value, city })}
            placeholder={t("cityPlaceholder")}
            searchPlaceholder={t("search")}
            emptyText={citiesQuery.isError ? t("loadError") : t("noResults")}
            disabled={!stateIso2}
            loading={citiesQuery.isLoading}
          />
        </div>
      </div>
    </div>
  )
}
