// MARES — Cliente server-side da API CountryStateCity (estado/cidade).
// A chave (CSC_API_KEY) NUNCA vai ao cliente — o acesso é feito por proxy em /api/geo.
// Cache em duas camadas: memória do processo (Map) + cache de fetch do Next (revalidate),
// pois os dados de localidade são praticamente estáticos.

import { env } from "@/env"

const BASE = "https://api.countrystatecity.in/v1"
const REVALIDATE_SECONDS = 60 * 60 * 24 * 30 // 30 dias

const memory = new Map<string, unknown>()

async function cscFetch<T>(path: string): Promise<T> {
  const cached = memory.get(path)
  if (cached) return cached as T

  const key = env.CSC_API_KEY
  if (!key) throw new Error("CSC_API_KEY não configurada")

  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-CSCAPI-KEY": key },
    next: { revalidate: REVALIDATE_SECONDS },
  })
  if (!res.ok) {
    throw new Error(`CountryStateCity respondeu ${res.status}`)
  }
  const data = (await res.json()) as T
  memory.set(path, data)
  return data
}

export type CscState = { id: number; name: string; iso2: string }
export type CscCity = { id: number; name: string }

const isoParam = /^[A-Za-z0-9]{1,10}$/

export async function getStates(ciso: string): Promise<CscState[]> {
  if (!isoParam.test(ciso)) return []
  const data = await cscFetch<CscState[]>(`/countries/${ciso.toUpperCase()}/states`)
  return data
    .map((s) => ({ id: s.id, name: s.name, iso2: s.iso2 }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getCities(ciso: string, siso: string): Promise<CscCity[]> {
  if (!isoParam.test(ciso) || !isoParam.test(siso)) return []
  const data = await cscFetch<CscCity[]>(
    `/countries/${ciso.toUpperCase()}/states/${siso.toUpperCase()}/cities`,
  )
  return data.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))
}
