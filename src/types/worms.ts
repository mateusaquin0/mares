// MARES — DTO de resultado de busca no WoRMS (proxy /api/worms).

export type WormsMatch = {
  aphiaId: number
  scientificName: string
  rank: string | null
  status: string | null
  family: string | null
  order: string | null
}
