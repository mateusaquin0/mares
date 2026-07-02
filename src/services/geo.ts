// MARES — Serviço de geolocalização (client, via proxy /api/geo).

import { http } from "@/lib/http"
import type { CscCity, CscState } from "@/types/geo"

export const geoService = {
  listStates: (countryIso2: string) =>
    http.get<CscState[]>(`/api/geo/countries/${countryIso2}/states`),
  listCities: (countryIso2: string, stateIso2: string) =>
    http.get<CscCity[]>(`/api/geo/countries/${countryIso2}/states/${stateIso2}/cities`),
}
