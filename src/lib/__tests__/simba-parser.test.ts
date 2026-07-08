import { describe, it, expect } from "vitest"
import { parseDarwinCore } from "@/lib/simba"

const xml = `<?xml version="1.0"?>
<dwr:SimpleDarwinRecordSet xmlns:dwc="http://rs.tdwg.org/dwc/terms/">
  <dwr:SimpleDarwinRecord>
    <dwc:recordNumber>SIMBA-123</dwc:recordNumber>
    <dwc:scientificName>Sotalia guianensis</dwc:scientificName>
    <dwc:eventDate>2026-03-15</dwc:eventDate>
    <dwc:measurementDeterminedDate>18/03/2026</dwc:measurementDeterminedDate>
    <dwc:decimalLatitude>-26,90</dwc:decimalLatitude>
    <dwc:decimalLongitude>-48.60</dwc:decimalLongitude>
    <dwc:locality>Praia Brava</dwc:locality>
    <dwc:municipality>Itajaí</dwc:municipality>
    <dwc:stateProvince>Santa Catarina</dwc:stateProvince>
    <dwc:sex>Fêmea</dwc:sex>
    <dwc:lifeStage>Juvenil</dwc:lifeStage>
    <dwc:occurrenceRemarks><![CDATA[carcaça fresca & íntegra]]></dwc:occurrenceRemarks>
  </dwr:SimpleDarwinRecord>
</dwr:SimpleDarwinRecordSet>`

describe("parseDarwinCore", () => {
  const r = parseDarwinCore(xml, "SIMBA-123")

  it("extrai espécie e número do registro (namespace-agnóstico)", () => {
    expect(r.species).toBe("Sotalia guianensis")
    expect(r.simbaRecordNumber).toBe("SIMBA-123")
  })

  it("normaliza a data do evento para ISO (yyyy-mm-dd)", () => {
    expect(r.eventDate).toBe("2026-03-15")
  })

  it("converte a data de necrópsia BR (DD/MM/YYYY) para ISO", () => {
    expect(r.necropsyDate).toBe("2026-03-18")
  })

  it("faz parse de coordenadas com vírgula ou ponto decimal", () => {
    expect(r.strandingLat).toBeCloseTo(-26.9)
    expect(r.strandingLon).toBeCloseTo(-48.6)
  })

  it("normaliza sexo e estágio de vida para os códigos do formulário", () => {
    expect(r.sex).toBe("F") // "Fêmea" → F
    expect(r.lifeStage).toBe("JUVENILE") // "Juvenil" → JUVENILE
  })

  it("decodifica CDATA e entidades nas observações", () => {
    expect(r.macroscopicNotes).toBe("carcaça fresca & íntegra")
  })

  it("cai para o recordNumber informado quando o XML não traz um", () => {
    const semNumero = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>Tursiops truncatus</scientificName></SimpleDarwinRecord>`,
      "FALLBACK-9"
    )
    expect(semNumero.simbaRecordNumber).toBe("FALLBACK-9")
    expect(semNumero.species).toBe("Tursiops truncatus")
  })

  it("usa 'U'/'UNDETERMINED' quando sexo/estágio ausentes", () => {
    const vazio = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>X</scientificName></SimpleDarwinRecord>`,
      "R"
    )
    expect(vazio.sex).toBe("U")
    expect(vazio.lifeStage).toBe("UNDETERMINED")
  })
})
