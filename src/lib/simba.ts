// MARES — Cliente do SIMBA (Sistema de Informação de Monitoramento da Biota Aquática, Petrobras).
// Busca um registro por número e faz o parse do XML no padrão Darwin Core (TDWG),
// devolvendo os campos já mapeados para o modelo Animal.
//
// O endpoint é configurável por env (SIMBA_API_URL). Por padrão usa o endpoint
// PÚBLICO de ocorrências (sem autenticação); o registro é filtrado pela query
// `record_number`. Para o endpoint autenticado, defina SIMBA_API_URL para
// `.../occurrences` e SIMBA_API_TOKEN (enviado como Bearer).
// Doc: https://simba.petrobras.com.br/simba/web/occurrences/doc — ver §7.1.

import { NotFoundError, ServiceUnavailableError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

const DEFAULT_SIMBA_URL =
  "https://simba.petrobras.com.br/simba/web/api/v1/occurrences/public"

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
  sex: string // código do form: "F" | "M" | "U" (indeterminado quando ausente)
  lifeStage: string | null
}

function endpointFor(recordNumber: string): string {
  const base = process.env.SIMBA_API_URL || DEFAULT_SIMBA_URL
  const url = new URL(base)
  url.searchParams.set("record_number", recordNumber)
  if (!url.searchParams.has("language")) url.searchParams.set("language", "pt_BR")
  return url.toString()
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

/** Isola o primeiro <SimpleDarwinRecord> do set (a busca por record_number retorna um). */
function firstRecordBlock(xml: string): string {
  const m = xml.match(
    /<(?:[A-Za-z0-9_]+:)?SimpleDarwinRecord\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?SimpleDarwinRecord>/i
  )
  return m ? m[1] : xml
}

function toFloat(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Mapeia o sexo do SIMBA (ex.: "Fêmea"/"Macho"/"Indefinido") para o código do form.
 *  Sem informação (ou valor desconhecido) → "U" (indeterminado). */
function normalizeSex(v: string | null): string {
  const s = (v ?? "").trim().toLowerCase()
  if (s.startsWith("f")) return "F" // fêmea / femea / female
  if (s.startsWith("m")) return "M" // macho / male
  return "U"
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

/** Faz o parse de um XML Darwin Core (SimpleDarwinRecordSet) em SimbaRecord. */
export function parseDarwinCore(xml: string, recordNumber: string): SimbaRecord {
  // No SIMBA, recordNumber é o identificador; occurrenceID é uma URN longa.
  const r = firstRecordBlock(xml)
  return {
    simbaRecordNumber: firstTerm(r, ["recordNumber", "catalogNumber", "occurrenceID"]) ?? recordNumber,
    species: firstTerm(r, ["scientificName"]),
    eventDate: toEventDate(firstTerm(r, ["eventDate"])),
    strandingLat: toFloat(firstTerm(r, ["decimalLatitude"])),
    strandingLon: toFloat(firstTerm(r, ["decimalLongitude"])),
    strandingBeach: firstTerm(r, ["locality", "verbatimLocality"]),
    municipality: firstTerm(r, ["municipality"]),
    state: firstTerm(r, ["stateProvince"]),
    sex: normalizeSex(firstTerm(r, ["sex"])),
    lifeStage: firstTerm(r, ["lifeStage"]),
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
