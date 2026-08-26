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
import { env } from "@/env"
import type { SexValue, LifeStageValue } from "@/lib/animal-enums"

const DEFAULT_SIMBA_URL = "https://simba.petrobras.com.br/simba/web/api/v1/occurrences/public"

// Timeout defensivo para não prender o request caso o SIMBA demore.
const TIMEOUT_MS = 15_000

export type SimbaRecord = {
  simbaRecordNumber: string
  species: string | null
  eventDate: string | null // ISO (yyyy-mm-dd) quando possível
  // Data de necrópsia: do SIMBA `measurementDeterminedDate` (vem em DD/MM/YYYY).
  necropsyDate: string | null // ISO (yyyy-mm-dd)
  strandingLat: number | null
  strandingLon: number | null
  strandingBeach: string | null
  municipality: string | null
  state: string | null
  // "Nome da instituição executora" (institutionCode) — em alguns PMPs vem como o nome do
  // trecho monitorado ("Trecho 09").
  executingInstitution: string | null
  sex: string // código do form: "F" | "M" | "U" (indeterminado quando ausente)
  lifeStage: string // código do form: FETUS|PUP|JUVENILE|ADULT|UNDETERMINED
  // Peso da carcaça em kg, do campo "Peso total" da biometria (ver measurementValueFor).
  necropsyWeightKg: number | null
  // "Exame externo": texto livre de observações (occurrenceRemarks). Os demais campos
  // de necrópsia (condição da carcaça/escore/morte) NÃO são exportados pela API do SIMBA.
  macroscopicNotes: string | null
}

function endpointFor(recordNumber: string): string {
  const base = env.SIMBA_API_URL || DEFAULT_SIMBA_URL
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
  // `localName` é constante interna (nome de termo Darwin Core), nunca entrada do usuário.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const re = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${localName}>`,
    "i",
  )
  const m = xml.match(re)
  if (!m) return null
  const value = decodeEntities(m[1] ?? "")
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
  // Lazy `[\s\S]*?` com terminador distinto (não há backtracking catastrófico) e a
  // entrada é o XML do SIMBA, não do usuário. Risco de ReDoS desprezível.
  const m = xml.match(
    // eslint-disable-next-line security/detect-unsafe-regex
    /<(?:[A-Za-z0-9_]+:)?SimpleDarwinRecord\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?SimpleDarwinRecord>/i,
  )
  return m?.[1] ?? xml
}

function toFloat(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Mapeia o sexo do SIMBA (ex.: "Fêmea"/"Macho"/"Indefinido") para o código do form.
 *  Sem informação (ou valor desconhecido) → "U" (indeterminado). */
function normalizeSex(v: string | null): SexValue {
  const s = (v ?? "").trim().toLowerCase()
  if (s.startsWith("f")) return "F" // fêmea / femea / female
  if (s.startsWith("m")) return "M" // macho / male
  return "U"
}

/** Mapeia o estágio de vida do SIMBA (Feto/Filhote/Juvenil/Adulto/Indeterminado)
 *  para o código do form. Sem informação/desconhecido → "UNDETERMINED". */
function normalizeLifeStage(v: string | null): LifeStageValue {
  const s = (v ?? "").trim().toLowerCase()
  if (s.startsWith("fet")) return "FETUS" // feto / fetus
  if (s.startsWith("fil")) return "PUP" // filhote
  if (s.startsWith("juv")) return "JUVENILE" // juvenil
  if (s.startsWith("adu")) return "ADULT" // adulto
  return "UNDETERMINED"
}

/** Normaliza a data do evento para ISO (yyyy-mm-dd) quando reconhecível. */
function toEventDate(v: string | null): string | null {
  if (!v) return null
  // Darwin Core costuma usar ISO 8601; pode vir com intervalo "start/end".
  const iso = v.split("/")[0]!.trim() // split sempre retorna >= 1 elemento
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Normaliza uma data brasileira (DD/MM/YYYY, como em measurementDeterminedDate) para ISO. */
function toBrDate(v: string | null): string | null {
  if (!v) return null
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // Fallback: se já vier em ISO.
  return toEventDate(v)
}

// ── Biometria ─────────────────────────────────────────────────────────────────
// A biometria não vem como um campo por medida: `measurementType` traz a LISTA de campos do
// formulário usado (aves, odontocetos, quelônios…) e `measurementValue` os valores na MESMA
// ordem, ambos como texto entre aspas separado por vírgula — com buracos onde a medida não
// foi tomada. Ex.: <"Comprimento total", "Peso total"> / <"88.6000", "6.6000">.

/** Quebra a lista de medidas do SIMBA nos seus itens (entre aspas; vazio = não medido). */
function measurementList(v: string | null): string[] {
  if (!v) return []
  const quoted = [...v.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "")
  return quoted.length > 0 ? quoted : v.split(",").map((s) => s.trim())
}

/**
 * Valor numérico da medida cujo NOME casa com `matches` (ex.: "Peso total").
 *
 * O pareamento é POSICIONAL, e o SIMBA nem sempre honra isso: o formulário "Odontoceti"
 * declara 24 rótulos e emite 23 valores — não existe slot para "Comprimento posterior da
 * nadadeira peitoral", e tudo a partir dele anda uma casa. Lido por índice, o "Peso total"
 * de um Sotalia adulto de 198 cm virava 13 kg (que é a largura da nadadeira peitoral, em cm)
 * no lugar dos 85,5 kg reais.
 *
 * Com as listas de tamanhos diferentes não há como saber ONDE começa o buraco, então o
 * pareamento é recusado inteiro: medida em branco, para alguém pesar na necrópsia, é melhor
 * que número errado gravado como dado científico.
 */
function measurementValueFor(xml: string, matches: (label: string) => boolean): number | null {
  const types = measurementList(term(xml, "measurementType"))
  const values = measurementList(term(xml, "measurementValue"))
  if (types.length !== values.length) return null
  const i = types.findIndex((t) => matches(t.trim().toLowerCase()))
  return i === -1 ? null : toFloat(values[i]?.trim() || null)
}

/** Faz o parse de um XML Darwin Core (SimpleDarwinRecordSet) em SimbaRecord. */
export function parseDarwinCore(xml: string, recordNumber: string): SimbaRecord {
  // No SIMBA, recordNumber é o identificador; occurrenceID é uma URN longa.
  const r = firstRecordBlock(xml)
  // "Peso total" é o rótulo em todos os formulários de biometria (aves, odontocetos,
  // quelônios) e vem em kg; `measurementUnit` só descreve as medidas de comprimento.
  // Zero é preenchimento de formulário — nenhuma carcaça pesa 0 kg —, então vale como
  // medida ausente: melhor deixar em branco para alguém pesar do que gravar peso falso.
  const weight = measurementValueFor(r, (t) => t.startsWith("peso"))
  return {
    simbaRecordNumber:
      firstTerm(r, ["recordNumber", "catalogNumber", "occurrenceID"]) ?? recordNumber,
    species: firstTerm(r, ["scientificName"]),
    eventDate: toEventDate(firstTerm(r, ["eventDate"])),
    necropsyDate: toBrDate(firstTerm(r, ["measurementDeterminedDate"])),
    strandingLat: toFloat(firstTerm(r, ["decimalLatitude"])),
    strandingLon: toFloat(firstTerm(r, ["decimalLongitude"])),
    strandingBeach: firstTerm(r, ["locality", "verbatimLocality"]),
    municipality: firstTerm(r, ["municipality"]),
    state: firstTerm(r, ["stateProvince"]),
    executingInstitution: firstTerm(r, ["institutionCode", "ownerInstitutionCode"]),
    sex: normalizeSex(firstTerm(r, ["sex"])),
    lifeStage: normalizeLifeStage(firstTerm(r, ["lifeStage"])),
    necropsyWeightKg: weight && weight > 0 ? weight : null,
    macroscopicNotes: firstTerm(r, ["occurrenceRemarks"]),
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
  if (env.SIMBA_API_TOKEN) {
    headers.Authorization = `Bearer ${env.SIMBA_API_TOKEN}`
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
