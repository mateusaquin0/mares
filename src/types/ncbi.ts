// MARES — DTO de resultado de busca no NCBI Taxonomy (proxy /api/ncbi).
// O NCBI cobre todos os reinos (bactérias, vírus, protozoários, helmintos…), base
// taxonômica do nome científico de patógenos.

export type NcbiMatch = {
  key: number // NCBI TaxId
  scientificName: string
  rank: string | null
  family: string | null
  order: string | null
}
