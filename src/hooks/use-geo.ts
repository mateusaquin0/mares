// MARES — Hooks de geolocalização (react-query sobre geoService).
// Estado/cidade vêm do proxy /api/geo; dados praticamente estáticos (cache longo).

import { useQuery } from "@tanstack/react-query"

import { geoService } from "@/services/geo"

export const geoKeys = {
  states: (country?: string) => ["geo", "states", country] as const,
  cities: (country?: string, state?: string) => ["geo", "cities", country, state] as const,
}

export function useGeoStates(country: string | undefined) {
  return useQuery({
    queryKey: geoKeys.states(country),
    queryFn: () => geoService.listStates(country!),
    enabled: !!country,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useGeoCities(country: string | undefined, state: string | undefined) {
  return useQuery({
    queryKey: geoKeys.cities(country, state),
    queryFn: () => geoService.listCities(country!, state!),
    enabled: !!country && !!state,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
