import { describe, it, expect } from "vitest"
import { buildDarwinCoreXml, type DwcAnimal } from "@/lib/darwin-core"

function animal(overrides: Partial<DwcAnimal> = {}): DwcAnimal {
  return {
    id: "a1",
    controlId: "CTRL-1",
    species: "Sotalia guianensis",
    taxonFamily: "Delphinidae",
    taxonOrder: "Artiodactyla",
    wormsAphiaId: 254974,
    strandingLat: -26.9,
    strandingLon: -48.6,
    eventDate: new Date("2026-03-15T00:00:00.000Z"),
    sex: "M",
    lifeStage: "ADULT",
    municipality: "Itajaí",
    state: "SC",
    strandingBeach: "Praia Brava",
    macroscopicNotes: null,
    simbaRecordNumber: null,
    research: { name: "Pesquisa X", organization: { name: "Lab Y" } },
    ...overrides,
  }
}

describe("buildDarwinCoreXml", () => {
  it("gera um SimpleDarwinRecordSet com um registro por animal", () => {
    const xml = buildDarwinCoreXml([animal(), animal({ id: "a2", controlId: "CTRL-2" })])
    expect(xml).toContain("<dwr:SimpleDarwinRecordSet")
    expect(xml.match(/<dwr:SimpleDarwinRecord>/g)).toHaveLength(2)
  })

  it("mapeia sexo e estágio de vida para o vocabulário Darwin Core", () => {
    const xml = buildDarwinCoreXml([animal({ sex: "M", lifeStage: "JUVENILE" })])
    expect(xml).toContain("<dwc:sex>Male</dwc:sex>")
    expect(xml).toContain("<dwc:lifeStage>subadult</dwc:lifeStage>") // JUVENILE → subadult
  })

  it("omite sexo indeterminado (U) e estágio UNDETERMINED", () => {
    const xml = buildDarwinCoreXml([animal({ sex: "U", lifeStage: "UNDETERMINED" })])
    expect(xml).not.toContain("<dwc:sex>")
    expect(xml).not.toContain("<dwc:lifeStage>")
  })

  it("formata eventDate como YYYY-MM-DD em UTC (sem deslocar o dia)", () => {
    const xml = buildDarwinCoreXml([animal()])
    expect(xml).toContain("<dwc:eventDate>2026-03-15</dwc:eventDate>")
  })

  it("escapa caracteres especiais de XML", () => {
    const xml = buildDarwinCoreXml([animal({ macroscopicNotes: 'peso < 5 & "grande"' })])
    expect(xml).toContain("&lt; 5 &amp; &quot;grande&quot;")
    expect(xml).not.toContain('< 5 & "grande"')
  })

  it("omite campos ausentes (tags vazias não aparecem)", () => {
    const xml = buildDarwinCoreXml([animal({ strandingBeach: null, macroscopicNotes: null })])
    expect(xml).not.toContain("<dwc:locality>")
    expect(xml).not.toContain("<dwc:occurrenceRemarks>")
  })

  it("usa o controlId como occurrenceID (ou o id como fallback)", () => {
    expect(buildDarwinCoreXml([animal({ controlId: "CTRL-9" })])).toContain(
      "<dwc:occurrenceID>CTRL-9</dwc:occurrenceID>"
    )
    expect(buildDarwinCoreXml([animal({ controlId: null, id: "fallback-id" })])).toContain(
      "<dwc:occurrenceID>fallback-id</dwc:occurrenceID>"
    )
  })

  it("monta o taxonConceptID (LSID) a partir do AphiaID do WoRMS", () => {
    const xml = buildDarwinCoreXml([animal({ wormsAphiaId: 254974 })])
    expect(xml).toContain("urn:lsid:marinespecies.org:taxname:254974")
  })
})
