// MARES — Cliente do SIMBA (Sistema de Informação de Monitoramento da Biota Aquática, Petrobras).
// Busca um registro por número e faz o parse do XML no padrão Darwin Core (TDWG),
// devolvendo os campos já mapeados para o modelo Animal.
//
// O endpoint é configurável por env (SIMBA_API_URL), usando o placeholder {record}.
// Por padrão usa o endpoint PÚBLICO (sem autenticação); se o acesso exigir token,
// defina SIMBA_API_TOKEN (enviado como Bearer). Ver docs/PROJETO_COMPLETO.md §7.1.

import { NotFoundError, ServiceUnavailableError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

const DEFAULT_SIMBA_URL =
  "https://simba.petrobras.com.br/simba/web/api/ocorrencia/{record}/dwc"

// Timeout defensivo para não prender o request caso o SIMBA demore.
const TIMEOUT_MS = 15_000

export type SimbaRecord = {
  simbaRecordNumber: string
  species: string | null
  eventDate: string | null // ISO (yyyy-mm-dd) quando possível
  strandingLat: number | null
  strandingLon: number | null
  strandingBeach: string | null
  municipality: string | null
  state: string | null
  sex: string | null
  lifeStage: string | null
}

function endpointFor(recordNumber: string): string {
  const template = process.env.SIMBA_API_URL || DEFAULT_SIMBA_URL
  const enc = encodeURIComponent(recordNumber)
  return template.includes("{record}")
    ? template.replace("{record}", enc)
    : // Sem placeholder: anexa como query param (contrato ?record_number=X).
      `${template}${template.includes("?") ? "&" : "?"}record_number=${enc}`
}

// ── Parsing de XML Darwin Core ────────────────────────────────────────────────
// Parser mínimo e namespace-agnóstico (casa pelo nome local da tag, ignorando o
// prefixo como dwc:/dwr:). Evita adicionar dependência de XML só para isto.

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

/** Primeiro valor de um termo Darwin Core pelo nome local (ex.: "scientificName"). */
function term(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${localName}>`,
    "i"
  )
  const m = xml.match(re)
  if (!m) return null
  const value = decodeEntities(m[1])
  return value === "" ? null : value
}

function firstTerm(xml: string, names: string[]): string | null {
  for (const n of names) {
    const v = term(xml, n)
    if (v) return v
  }
  return null
}

function toFloat(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Normaliza a data do evento para ISO (yyyy-mm-dd) quando reconhecível. */
function toEventDate(v: string | null): string | null {
  if (!v) return null
  // Darwin Core costuma usar ISO 8601; pode vir com intervalo "start/end".
  const iso = v.split("/")[0].trim()
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Faz o parse de um XML Darwin Core em SimbaRecord. */
export function parseDarwinCore(xml: string, recordNumber: string): SimbaRecord {
  return {
    simbaRecordNumber: firstTerm(xml, ["occurrenceID", "catalogNumber", "recordNumber"]) ?? recordNumber,
    species: firstTerm(xml, ["scientificName"]),
    eventDate: toEventDate(firstTerm(xml, ["eventDate"])),
    strandingLat: toFloat(firstTerm(xml, ["decimalLatitude"])),
    strandingLon: toFloat(firstTerm(xml, ["decimalLongitude"])),
    strandingBeach: firstTerm(xml, ["locality", "verbatimLocality"]),
    municipality: firstTerm(xml, ["municipality"]),
    state: firstTerm(xml, ["stateProvince"]),
    sex: firstTerm(xml, ["sex"]),
    lifeStage: firstTerm(xml, ["lifeStage"]),
  }
}

/**
 * Busca um registro no SIMBA e devolve os campos mapeados.
 * @throws NotFoundError se o registro não existir (404 no SIMBA).
 * @throws ServiceUnavailableError se o SIMBA falhar ou responder algo inválido.
 */
export async function fetchSimbaRecord(recordNumber: string): Promise<SimbaRecord> {
  const url = endpointFor(recordNumber)
  const headers: Record<string, string> = { Accept: "application/xml, text/xml" }
  if (process.env.SIMBA_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.SIMBA_API_TOKEN}`
  }

  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new ServiceUnavailableError("Falha ao contatar o SIMBA", ERROR_CODES.simbaUnavailable)
  }

  if (res.status === 404) {
    throw new NotFoundError("Registro não encontrado no SIMBA", ERROR_CODES.simbaNotFound)
  }
  if (!res.ok) {
    throw new ServiceUnavailableError("SIMBA respondeu com erro", ERROR_CODES.simbaUnavailable)
  }

  const xml = await res.text()
  const record = parseDarwinCore(xml, recordNumber)

  // Sem espécie o registro é inútil para o cadastro — trata como não encontrado.
  if (!record.species) {
    throw new NotFoundError("Registro do SIMBA sem dados utilizáveis", ERROR_CODES.simbaNotFound)
  }
  return record
}
