// MARES — DTOs de geolocalização (proxy /api/geo → CountryStateCity).

export type CscState = { id: number; name: string; iso2: string }
export type CscCity = { id: number; name: string }
