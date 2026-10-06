import { describe, it, expect } from "vitest"
import { parseDarwinCore } from "@/lib/simba"

const xml = `<?xml version="1.0"?>
<dwr:SimpleDarwinRecordSet xmlns:dwc="http://rs.tdwg.org/dwc/terms/">
  <dwr:SimpleDarwinRecord>
    <dwc:recordNumber>SIMBA-123</dwc:recordNumber>
    <dwc:institutionCode>Trecho 09</dwc:institutionCode>
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
    <dc:measurementType>"Comprimento total", "Peso total", "Largura nadadeira caudal"</dc:measurementType>
    <dc:measurementValue>"88.6000", "6.6000", ""</dc:measurementValue>
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

  it("traz a instituição executora (o trecho do PMP)", () => {
    expect(r.executingInstitution).toBe("Trecho 09")
  })

  it("extrai o peso (kg) da lista de biometria, pareando tipo e valor", () => {
    expect(r.necropsyWeightKg).toBe(6.6)
  })

  it("trata peso zerado como medida ausente (preenchimento de formulário no SIMBA)", () => {
    const zerado = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>X</scientificName>
       <measurementType>"Peso total"</measurementType>
       <measurementValue>"0.0000"</measurementValue></SimpleDarwinRecord>`,
      "R",
    )
    expect(zerado.necropsyWeightKg).toBeNull()
  })

  it("deixa o peso nulo quando a medida não foi tomada ou não há biometria", () => {
    const semPeso = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>X</scientificName>
       <measurementType>"Comprimento total", "Peso total"</measurementType>
       <measurementValue>"88.6000", ""</measurementValue></SimpleDarwinRecord>`,
      "R",
    )
    expect(semPeso.necropsyWeightKg).toBeNull()
    const semBiometria = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>X</scientificName></SimpleDarwinRecord>`,
      "R",
    )
    expect(semBiometria.necropsyWeightKg).toBeNull()
    expect(semBiometria.executingInstitution).toBeNull()
  })

  it("decodifica CDATA e entidades nas observações", () => {
    expect(r.macroscopicNotes).toBe("carcaça fresca & íntegra")
  })

  // Regressão do registro real 321779 (Sotalia guianensis, macho adulto, 198 cm): o
  // formulário "Odontoceti" do SIMBA declara 24 rótulos e emite 23 valores — falta o slot de
  // "Comprimento posterior da nadadeira peitoral" e tudo a partir dele anda uma casa. Pareado
  // por índice, o peso virava 13 (a largura da nadadeira peitoral, em cm) em vez dos 85,5 kg.
  it("recusa o pareamento quando o SIMBA emite menos valores que rótulos", () => {
    const desalinhado = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>Sotalia guianensis</scientificName>
       <measurementType>"Comprimento total (extremo da maxila até a reentrância caudal)", "Comprimento anterior da nadadeira peitoral", "Comprimento posterior da nadadeira peitoral", "Peso total", "Largura máxima da nadadeira peitoral"</measurementType>
       <measurementValue>"198.0000", "30.5000", "85.5000", "13.0000"</measurementValue></SimpleDarwinRecord>`,
      "321779",
    )
    expect(desalinhado.necropsyWeightKg).toBeNull()
  })

  it("pareia normalmente quando as duas listas têm o mesmo tamanho", () => {
    // Mesmo registro com o slot que falta preenchido: o peso volta a ser legível.
    const alinhado = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>Sotalia guianensis</scientificName>
       <measurementType>"Comprimento total (extremo da maxila até a reentrância caudal)", "Comprimento anterior da nadadeira peitoral", "Comprimento posterior da nadadeira peitoral", "Peso total", "Largura máxima da nadadeira peitoral"</measurementType>
       <measurementValue>"198.0000", "30.5000", "", "85.5000", "13.0000"</measurementValue></SimpleDarwinRecord>`,
      "321779",
    )
    expect(alinhado.necropsyWeightKg).toBe(85.5)
  })

  it("cai para o recordNumber informado quando o XML não traz um", () => {
    const semNumero = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>Tursiops truncatus</scientificName></SimpleDarwinRecord>`,
      "FALLBACK-9",
    )
    expect(semNumero.simbaRecordNumber).toBe("FALLBACK-9")
    expect(semNumero.species).toBe("Tursiops truncatus")
  })

  it("usa 'U'/'UNDETERMINED' quando sexo/estágio ausentes", () => {
    const vazio = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>X</scientificName></SimpleDarwinRecord>`,
      "R",
    )
    expect(vazio.sex).toBe("U")
    expect(vazio.lifeStage).toBe("UNDETERMINED")
  })

  // ── Biometria ───────────────────────────────────────────────────────────────

  it("extrai o bloco de biometria com grupo, unidade e rótulos literais", () => {
    expect(r.biometry).toEqual({
      group: null, // sem measurementID no fixture
      unit: null,
      measures: [
        { label: "Comprimento total", value: 88.6 },
        { label: "Peso total", value: 6.6 },
        { label: "Largura nadadeira caudal", value: null },
      ],
    })
  })

  it('guarda a medida não preenchida como null (o "Não informado" da tela do SIMBA)', () => {
    const vazia = r.biometry!.measures.find((m) => m.label === "Largura nadadeira caudal")
    expect(vazia).toEqual({ label: "Largura nadadeira caudal", value: null })
  })

  // Registro real 740505 (Sotalia guianensis, macho juvenil, 130 cm, Ubatuba/SP): o formulário
  // Odontoceti declara 24 rótulos e emite 23 valores, omitindo sempre o slot de "Comprimento
  // posterior da nadadeira peitoral" (11º). Verificado em 495 indivíduos de 12 espécies.
  const ODONTOCETI = [
    "Comprimento total (extremo da maxila até a reentrância caudal)",
    "Extremo da maxila ao centro do orifício respiratório",
    "Extremo da maxila ao início do melão",
    "Extremo maxila à inserção anterior da nadadeira dorsal",
    "Extremo maxila à inserção anterior da nadadeira peitoral",
    "Extremo da maxila ao centro da abertura genital",
    "Extremo da maxila ao centro do ânus",
    "Extremo da maxila até o centro do olho",
    "Comprimento da base da nadadeira dorsal",
    "Comprimento anterior da nadadeira peitoral",
    "Comprimento posterior da nadadeira peitoral",
    "Peso total",
    "Largura máxima da nadadeira peitoral",
    "Largura nadadeira caudal",
    "Circunferência do corpo na altura das axilas",
    "Altura da nadadeira dorsal",
    "Circunferência do corpo na altura do ânus",
    "Espessura da camada de gordura (região dorsal)",
    "Espessura da camada de gordura (região lateral)",
    "Espessura da camada de gordura (região ventral)",
    "Número de dentes maxila direita",
    "Número de dentes maxila esquerda",
    "Número de dentes mandíbula direita",
    "Número de dentes mandíbula esquerda",
  ]
  const VALORES_740505 =
    '"130.0000", "21.0000", "10.0000", "62.0000", "34.0000", "80.5000", "91.5000", "20.5000", ' +
    '"20.0000", "22.2000", "31.0000", "9.0000", "34.5000", "77.0000", "10.5000", "46.0000", ' +
    '"", "", "", "31", "31", "32", "33"'

  function odontoceto(valores: string, grupo = "ID: 201682, Odontoceti") {
    return parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>Sotalia guianensis</scientificName>
       <measurementID>${grupo}</measurementID>
       <measurementUnit>Cm</measurementUnit>
       <measurementType>${ODONTOCETI.map((l) => `"${l}"`).join(", ")}</measurementType>
       <measurementValue>${valores}</measurementValue></SimpleDarwinRecord>`,
      "740505",
    )
  }

  it("compensa o slot que o SIMBA não emite no formulário Odontoceti", () => {
    const m = odontoceto(VALORES_740505).biometry!.measures
    const por = (label: string) => m.find((x) => x.label === label)?.value
    // O rótulo omitido fica sem valor; os seguintes descem uma casa.
    expect(por("Comprimento posterior da nadadeira peitoral")).toBeNull()
    expect(por("Peso total")).toBe(31)
    expect(por("Circunferência do corpo na altura das axilas")).toBe(77)
    expect(por("Circunferência do corpo na altura do ânus")).toBe(46)
    // O 24º campo só existe com a compensação: sem ela nunca recebe valor.
    expect(por("Número de dentes mandíbula esquerda")).toBe(33)
    // Antes do buraco nada se move.
    expect(por("Comprimento total (extremo da maxila até a reentrância caudal)")).toBe(130)
    expect(por("Comprimento anterior da nadadeira peitoral")).toBe(22.2)
  })

  it("leva o peso compensado para necropsyWeightKg", () => {
    expect(odontoceto(VALORES_740505).necropsyWeightKg).toBe(31)
  })

  it("lê o grupo do measurementID e a unidade base do measurementUnit", () => {
    const b = odontoceto(VALORES_740505).biometry!
    expect(b.group).toBe("Odontoceti")
    expect(b.unit).toBe("Cm")
  })

  it("recusa o bloco quando falta valor em formulário sem defeito conhecido", () => {
    // Mesmo déficit de 1, mas outro formulário: sem saber onde está o buraco, não pareia.
    const r2 = odontoceto(VALORES_740505, "ID: 999, Quelônio")
    expect(r2.biometry).toBeNull()
    expect(r2.necropsyWeightKg).toBeNull()
  })

  it("recusa o bloco quando faltam DOIS valores, mesmo no Odontoceti", () => {
    const faltamDois = VALORES_740505.replace(', "33"', "")
    const r2 = odontoceto(faltamDois)
    expect(r2.biometry).toBeNull()
    expect(r2.necropsyWeightKg).toBeNull()
  })

  it("não devolve biometria quando o registro não tem medidas", () => {
    const sem = parseDarwinCore(
      `<SimpleDarwinRecord><scientificName>X</scientificName></SimpleDarwinRecord>`,
      "R",
    )
    expect(sem.biometry).toBeNull()
  })
})
