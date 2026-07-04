// MARES — Exportação Simple Darwin Core (Fase 6). Ver docs/DARWIN_CORE_EXPORT.md.
// Serializa os animais de uma pesquisa no padrão Simple Darwin Core (XML), compatível
// com submissão ao GBIF/SiBBr. O mapeamento converte os valores internos (sexo M/F/U,
// estágio de vida FETUS/PUP/JUVENILE/ADULT/UNDETERMINED) para o vocabulário Darwin Core.

export type DwcResearch = {
  name: string
  organization: { name: string }
}

// Campos do animal usados na exportação (selecionados na rota). A pesquisa é embutida por
// animal (datasetName/institutionCode) para suportar seleções que cruzam pesquisas.
export type DwcAnimal = {
  id: string
  controlId: string | null
  species: string
  taxonFamily: string | null
  taxonOrder: string | null
  wormsAphiaId: number | null
  strandingLat: number | null
  strandingLon: number | null
  eventDate: Date | null
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  strandingBeach: string | null
  macroscopicNotes: string | null
  simbaRecordNumber: string | null
  research: DwcResearch
}

// Valores internos → vocabulário Darwin Core. Valores sem correspondência são omitidos.
const SEX_MAP: Record<string, string> = { M: "Male", F: "Female" } // U (indeterminado) → omitido
const LIFE_STAGE_MAP: Record<string, string> = {
  FETUS: "fetus",
  PUP: "juvenile",
  JUVENILE: "subadult",
  ADULT: "adult",
  // UNDETERMINED → omitido
}

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Retorna "" (string vazia) para valores ausentes, para o campo ser filtrado do XML.
function tag(name: string, value: string): string {
  if (!value) return ""
  return `<${name}>${esc(value)}</${name}>`
}

function recordXml(a: DwcAnimal): string {
  const r = a.research
  const lat = a.strandingLat != null ? String(a.strandingLat) : ""
  const lon = a.strandingLon != null ? String(a.strandingLon) : ""
  const fields = [
    tag("dwc:occurrenceID", a.controlId ?? a.id),
    tag("dwc:basisOfRecord", "PreservedSpecimen"),
    tag("dcterms:type", "PhysicalObject"),
    tag("dwc:scientificName", a.species),
    tag("dwc:taxonRank", "species"),
    tag("dwc:family", a.taxonFamily ?? ""),
    tag("dwc:order", a.taxonOrder ?? ""),
    tag(
      "dwc:taxonConceptID",
      a.wormsAphiaId ? `urn:lsid:marinespecies.org:taxname:${a.wormsAphiaId}` : ""
    ),
    tag("dwc:eventDate", a.eventDate ? a.eventDate.toISOString().slice(0, 10) : ""),
    tag("dwc:decimalLatitude", lat),
    tag("dwc:decimalLongitude", lon),
    tag("dwc:geodeticDatum", lat ? "WGS84" : ""),
    tag("dwc:country", "Brazil"),
    tag("dwc:countryCode", "BR"),
    tag("dwc:stateProvince", a.state ?? ""),
    tag("dwc:municipality", a.municipality ?? ""),
    tag("dwc:locality", a.strandingBeach ?? ""),
    tag("dwc:sex", SEX_MAP[a.sex ?? ""] ?? ""),
    tag("dwc:lifeStage", LIFE_STAGE_MAP[a.lifeStage ?? ""] ?? ""),
    tag("dwc:catalogNumber", a.simbaRecordNumber ?? ""),
    tag("dwc:occurrenceRemarks", a.macroscopicNotes ?? ""),
    tag("dwc:datasetName", r.name),
    tag("dwc:institutionCode", r.organization.name),
    tag("dcterms:language", "pt"),
  ]
    .filter(Boolean)
    .map((line) => `    ${line}`)
    .join("\n")
  return `  <dwr:SimpleDarwinRecord>\n${fields}\n  </dwr:SimpleDarwinRecord>`
}

export function buildDarwinCoreXml(animals: DwcAnimal[]): string {
  const xmlns = [
    'xmlns:dwr="http://rs.tdwg.org/dwc/dwcrecord/"',
    'xmlns:dcterms="http://purl.org/dc/terms/"',
    'xmlns:dwc="http://rs.tdwg.org/dwc/terms/"',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    'xsi:schemaLocation="http://rs.tdwg.org/dwc/xsd/simpledarwincore/ http://rs.tdwg.org/dwc/xsd/simpledarwincore/tdwg_dwc_simple.xsd"',
  ].join("\n  ")
  const body = animals.map((a) => recordXml(a)).join("\n\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<dwr:SimpleDarwinRecordSet
  ${xmlns}>

${body}

</dwr:SimpleDarwinRecordSet>
`
}
