// MARES — Consulta taxonômica server-side ao WoRMS (World Register of Marine Species).
// Usado no import do SIMBA para enriquecer/validar a espécie (AphiaID, família, ordem).
// O autocomplete do formulário usa /api/worms (busca "like"); aqui fazemos o match
// exato do nome científico (AphiaRecordsByMatchNames). Doc: docs/PROJETO_COMPLETO.md §7.2.

export type WormsMatch = {
  wormsAphiaId: number
  taxonFamily: string | null
  taxonOrder: string | null
  acceptedName: string | null
}

type AphiaRecord = {
  AphiaID: number
  scientificname: string | null
  status: string | null
  family: string | null
  order: string | null
  valid_AphiaID?: number | null
  valid_name?: string | null
}

/**
 * Faz o match exato de um nome científico no WoRMS.
 * Retorna null se não houver correspondência (ou em qualquer falha da API — o
 * enriquecimento é best-effort e nunca deve bloquear o import).
 */
export async function matchWormsSpecies(name: string): Promise<WormsMatch | null> {
  const scientific = name.trim()
  if (scientific.length < 3) return null

  const url = `https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=${encodeURIComponent(
    scientific,
  )}&marine_only=false`

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } })
    if (res.status === 204 || !res.ok) return null

    // A resposta é um array por nome consultado: AphiaRecord[][].
    const data = (await res.json()) as AphiaRecord[][] | null
    const records = Array.isArray(data) ? data[0] : null
    if (!Array.isArray(records) || records.length === 0) return null

    // Prioriza um nome aceito; senão usa o primeiro retornado.
    const best = records.find((r) => r.status === "accepted") ?? records[0]
    if (!best?.AphiaID) return null

    return {
      wormsAphiaId: best.valid_AphiaID ?? best.AphiaID,
      taxonFamily: best.family ?? null,
      taxonOrder: best.order ?? null,
      acceptedName: best.valid_name ?? best.scientificname ?? null,
    }
  } catch {
    return null
  }
}
