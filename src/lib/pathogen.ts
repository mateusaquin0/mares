// MARES — "Patógeno amplo" (nível de rastreio): elegível a confirmação de espécie por
// sequenciamento (docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md). Só faz sentido quando o positivo é
// de um alvo AMPLO — acima de espécie (ex.: família Sarcocystidae, gênero Sarcocystis sp.) — e
// não de uma espécie já resolvida (ex.: Toxoplasma gondii).
//
// Decisão determinística pelo `taxonRank` do NCBI quando disponível; senão, fallback lexical
// sobre o nome científico (registros antigos sem rank / edição manual).

// Ranks NCBI acima de espécie (amplos). Espécie e abaixo (subspecies, strain, "no rank"…) → falso.
const SUPRASPECIFIC_RANKS = new Set([
  "genus",
  "subgenus",
  "tribe",
  "subtribe",
  "family",
  "subfamily",
  "superfamily",
  "order",
  "suborder",
  "infraorder",
  "class",
  "subclass",
  "phylum",
  "subphylum",
  "kingdom",
  "superkingdom",
  "clade",
])

const HIGHER_RANK_SUFFIX = /(idae|aceae|oidea|acea|ineae|inae|ales)$/i

export function isBroadPathogen(p: {
  scientificName?: string | null
  taxonFamily?: string | null
  taxonRank?: string | null
}): boolean {
  // 1. Determinístico: rank do NCBI.
  const rank = p.taxonRank?.trim().toLowerCase()
  if (rank) return SUPRASPECIFIC_RANKS.has(rank)

  // 2. Fallback lexical (sem rank gravado).
  const sci = p.scientificName?.trim()
  if (!sci) return false
  // Gênero: "... sp." / "... spp." (com ou sem ponto).
  if (/\bspp?\.?$/i.test(sci)) return true
  // Táxon superior em um único token (família/superfamília/ordem).
  if (!/\s/.test(sci) && HIGHER_RANK_SUFFIX.test(sci)) return true
  // Registro cujo próprio nome é a família.
  if (p.taxonFamily && sci.toLowerCase() === p.taxonFamily.trim().toLowerCase()) return true
  return false
}
