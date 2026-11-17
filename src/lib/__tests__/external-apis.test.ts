// Integrações externas (SIMBA, WoRMS, CountryStateCity, NCBI) com `fetch` simulado: sucesso,
// erro HTTP, corpo malformado e falha de rede/timeout. Nenhuma chamada real sai daqui.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const env = vi.hoisted(() => ({
  CSC_API_KEY: "csc-key" as string | undefined,
  SIMBA_API_URL: undefined as string | undefined,
  SIMBA_API_TOKEN: undefined as string | undefined,
}))
vi.mock("@/env", () => ({ env }))

import { getCities, getStates } from "@/lib/csc"
import { NotFoundError, ServiceUnavailableError } from "@/lib/errors"
import { firstTag, lineageName, parseNcbiTaxa, topLevelTaxa } from "@/lib/ncbi"
import { fetchSimbaRecord, parseDarwinCore, parseMeasurements } from "@/lib/simba"
import { matchWormsSpecies } from "@/lib/worms"

type FakeResponse = {
  status?: number
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
function respond(r: FakeResponse) {
  const status = r.status ?? 200
  fetchMock.mockResolvedValue({ status, ok: status >= 200 && status < 300, ...r } as Response)
}
const calledUrl = () => new URL(fetchMock.mock.calls[0]![0])
const calledHeaders = () => fetchMock.mock.calls[0]![1]?.headers as Record<string, string>

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  env.CSC_API_KEY = "csc-key"
  env.SIMBA_API_URL = undefined
  env.SIMBA_API_TOKEN = undefined
})
afterEach(() => vi.unstubAllGlobals())

const record = (inner: string) =>
  `<dwr:SimpleDarwinRecordSet><dwr:SimpleDarwinRecord>${inner}</dwr:SimpleDarwinRecord></dwr:SimpleDarwinRecordSet>`

describe("fetchSimbaRecord", () => {
  const XML = record(
    "<dwc:recordNumber>225696</dwc:recordNumber><dwc:scientificName>Sotalia guianensis</dwc:scientificName>",
  )

  it("consulta o endpoint público por número de registro, em pt_BR e sem credencial", async () => {
    respond({ text: async () => XML })
    const rec = await fetchSimbaRecord("225696")
    expect(rec.species).toBe("Sotalia guianensis")

    const url = calledUrl()
    expect(url.origin + url.pathname).toBe(
      "https://simba.petrobras.com.br/simba/web/api/v1/occurrences/public",
    )
    expect(url.searchParams.get("record_number")).toBe("225696")
    expect(url.searchParams.get("language")).toBe("pt_BR")
    expect(calledHeaders().Authorization).toBeUndefined()
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it("o número do registro vai codificado na query, sem alterar o caminho", async () => {
    respond({ text: async () => XML })
    await fetchSimbaRecord("12/34&language=en")
    const url = calledUrl()
    expect(url.pathname).toBe("/simba/web/api/v1/occurrences/public")
    expect(url.searchParams.get("record_number")).toBe("12/34&language=en")
    expect(url.searchParams.get("language")).toBe("pt_BR")
  })

  it("endpoint autenticado: usa a URL configurada, preserva o idioma dela e envia o Bearer", async () => {
    env.SIMBA_API_URL = "https://simba.example/api/occurrences?language=en"
    env.SIMBA_API_TOKEN = "segredo"
    respond({ text: async () => XML })
    await fetchSimbaRecord("1")
    const url = calledUrl()
    expect(url.host).toBe("simba.example")
    expect(url.searchParams.get("language")).toBe("en")
    expect(calledHeaders().Authorization).toBe("Bearer segredo")
  })

  it("404 do SIMBA vira 'registro não encontrado'", async () => {
    respond({ status: 404 })
    const err = await fetchSimbaRecord("0").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err).toMatchObject({ code: "simbaNotFound" })
  })

  it.each([500, 502, 401, 429])("HTTP %i vira 'SIMBA indisponível' (503)", async (status) => {
    respond({ status })
    const err = await fetchSimbaRecord("1").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ServiceUnavailableError)
    expect(err).toMatchObject({ code: "simbaUnavailable" })
  })

  it("falha de rede ou timeout vira 'SIMBA indisponível', não erro interno", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"))
    await expect(fetchSimbaRecord("1")).rejects.toMatchObject({
      name: "ServiceUnavailableError",
      code: "simbaUnavailable",
    })
  })

  it("corpo que não pôde ser lido vira 'SIMBA indisponível'", async () => {
    respond({
      text: async () => {
        throw new Error("stream interrompido")
      },
    })
    await expect(fetchSimbaRecord("1")).rejects.toMatchObject({ code: "simbaUnavailable" })
  })

  // Sem espécie não há o que cadastrar: é o que o SIMBA devolve para número inexistente no
  // endpoint público (200 com o conjunto vazio).
  it.each([
    ["conjunto vazio", "<dwr:SimpleDarwinRecordSet></dwr:SimpleDarwinRecordSet>"],
    ["HTML de erro com status 200", "<html><body>Manutenção</body></html>"],
    ["corpo vazio", ""],
    ["registro sem espécie", record("<dwc:recordNumber>9</dwc:recordNumber>")],
  ])("%s vira 'registro não encontrado'", async (_label, body) => {
    respond({ text: async () => body })
    await expect(fetchSimbaRecord("9")).rejects.toMatchObject({
      name: "NotFoundError",
      code: "simbaNotFound",
    })
  })
})

describe("parser do SIMBA — bordas", () => {
  it("sem número no XML, usa o número consultado; cai para catalogNumber quando existe", () => {
    expect(parseDarwinCore(record(""), "777").simbaRecordNumber).toBe("777")
    expect(
      parseDarwinCore(record("<dwc:catalogNumber>C-1</dwc:catalogNumber>"), "777")
        .simbaRecordNumber,
    ).toBe("C-1")
  })

  it("XML sem o envelope de registro ainda é lido", () => {
    const rec = parseDarwinCore("<scientificName>Tursiops truncatus</scientificName>", "1")
    expect(rec.species).toBe("Tursiops truncatus")
  })

  it.each([
    ["Macho", "M"],
    ["male", "M"],
    ["FÊMEA", "F"],
    ["female", "F"],
    ["Indefinido", "U"],
    ["", "U"],
  ])("sexo %j → %s", (raw, code) => {
    expect(parseDarwinCore(record(`<dwc:sex>${raw}</dwc:sex>`), "1").sex).toBe(code)
  })

  it.each([
    ["Feto", "FETUS"],
    ["Filhote", "PUP"],
    ["Juvenil", "JUVENILE"],
    ["Adulto", "ADULT"],
    ["Indeterminado", "UNDETERMINED"],
    ["Subadulto", "UNDETERMINED"],
  ])("estágio de vida %j → %s", (raw, code) => {
    expect(parseDarwinCore(record(`<dwc:lifeStage>${raw}</dwc:lifeStage>`), "1").lifeStage).toBe(
      code,
    )
  })

  it.each([
    ["2026-03-15T10:00:00Z", "2026-03-15"],
    ["2026-03-15/2026-03-18", "2026-03-15"],
    ["15/03/2026", "2026-03-15"],
    ["2026", null],
    ["março de 2026", null],
  ])("data do evento %j → %j (sem dia completo não há data)", (raw, iso) => {
    expect(parseDarwinCore(record(`<dwc:eventDate>${raw}</dwc:eventDate>`), "1").eventDate).toBe(
      iso,
    )
  })

  it("data de necrópsia aceita o formato brasileiro e também ISO", () => {
    const at = (v: string) =>
      parseDarwinCore(
        record(`<dwc:measurementDeterminedDate>${v}</dwc:measurementDeterminedDate>`),
        "1",
      ).necropsyDate
    expect(at("18/03/2026")).toBe("2026-03-18")
    expect(at("2026-03-18")).toBe("2026-03-18")
    expect(at("ontem")).toBeNull()
  })

  it("coordenada não numérica vira null; entidades XML são decodificadas", () => {
    const rec = parseDarwinCore(
      record(
        "<dwc:decimalLatitude>sul</dwc:decimalLatitude>" +
          "<dwc:locality>Praia &quot;Brava&quot; &amp; Costão &lt;N&gt; d&#39;Oeste</dwc:locality>",
      ),
      "1",
    )
    expect(rec.strandingLat).toBeNull()
    expect(rec.strandingBeach).toBe('Praia "Brava" & Costão <N> d\'Oeste')
  })

  it("praia e instituição caem para os termos alternativos do Darwin Core", () => {
    const rec = parseDarwinCore(
      record(
        "<dwc:verbatimLocality>Praia do Rosa</dwc:verbatimLocality>" +
          "<dwc:ownerInstitutionCode>Trecho 09</dwc:ownerInstitutionCode>",
      ),
      "1",
    )
    expect(rec.strandingBeach).toBe("Praia do Rosa")
    expect(rec.executingInstitution).toBe("Trecho 09")
  })
})

describe("parseMeasurements — biometria do SIMBA", () => {
  const bio = (types: string, values: string, extra = "") =>
    record(
      `<dc:measurementType>${types}</dc:measurementType>` +
        `<dc:measurementValue>${values}</dc:measurementValue>${extra}`,
    )
  const labels = (n: number) => Array.from({ length: n }, (_, i) => `"Medida ${i + 1}"`).join(", ")
  const values = (n: number) => Array.from({ length: n }, (_, i) => `"${i + 1}.0"`).join(", ")

  it("sem lista de medidas não há biometria", () => {
    expect(parseMeasurements(record("<dwc:sex>M</dwc:sex>"))).toBeNull()
    expect(parseDarwinCore(record(""), "1").measurementCounts).toBeNull()
  })

  it("pareia rótulo e valor pela posição; vazio é 'não medido'; grupo e unidade são literais", () => {
    const b = parseMeasurements(
      bio(
        '"Comprimento total", "Peso total", "Número de dentes"',
        '"198.0", "", "0"',
        "<dc:measurementID>ID: 225696, Odontoceti</dc:measurementID><dc:measurementUnit>Cm</dc:measurementUnit>",
      ),
    )
    expect(b).toEqual({
      group: "Odontoceti",
      unit: "Cm",
      measures: [
        { label: "Comprimento total", value: 198 },
        { label: "Peso total", value: null },
        { label: "Número de dentes", value: 0 },
      ],
    })
  })

  it("lista sem aspas é separada por vírgula", () => {
    const b = parseMeasurements(bio("Comprimento total, Peso total", "88.6, 6.6"))
    expect(b?.measures).toEqual([
      { label: "Comprimento total", value: 88.6 },
      { label: "Peso total", value: 6.6 },
    ])
  })

  it("measurementID sem nome de formulário não define o grupo", () => {
    const b = parseMeasurements(
      bio('"Peso total"', '"6.6"', "<dc:measurementID>ID: 1</dc:measurementID>"),
    )
    expect(b?.group).toBeNull()
  })

  // Defeito conhecido da exportação: o formulário Odontoceti declara 24 rótulos e manda 23
  // valores, omitindo sempre o 11º. Sem compensar, tudo a partir dele anda uma casa.
  it("Odontoceti com um valor a menos: o 11º rótulo fica vazio e os seguintes descem", () => {
    const xml = bio(
      labels(24),
      values(23),
      "<dc:measurementID>ID: 9, Odontoceti</dc:measurementID>",
    )
    const b = parseMeasurements(xml)
    expect(b?.measures).toHaveLength(24)
    expect(b?.measures[9]).toEqual({ label: "Medida 10", value: 10 })
    expect(b?.measures[10]).toEqual({ label: "Medida 11", value: null })
    expect(b?.measures[11]).toEqual({ label: "Medida 12", value: 11 })
    expect(b?.measures[23]).toEqual({ label: "Medida 24", value: 23 })
    expect(parseDarwinCore(xml, "1").measurementCounts).toEqual({ labels: 24, values: 23 })
  })

  // Medida em branco é melhor que número errado gravado como dado científico.
  it.each([
    ["outro formulário com um valor a menos", 24, 23, "Quelônio"],
    ["Odontoceti com dois valores a menos", 24, 22, "Odontoceti"],
    ["Odontoceti com valor sobrando", 5, 6, "Odontoceti"],
    ["Odontoceti curto demais para ter o 11º rótulo", 5, 4, "Odontoceti"],
  ])("recusa o pareamento: %s", (_label, nLabels, nValues, group) => {
    const xml = bio(
      labels(nLabels),
      values(nValues),
      `<dc:measurementID>ID: 9, ${group}</dc:measurementID>`,
    )
    expect(parseMeasurements(xml)).toBeNull()
    const rec = parseDarwinCore(xml, "1")
    expect(rec.biometry).toBeNull()
    expect(rec.necropsyWeightKg).toBeNull()
    // A tela usa as contagens para explicar a recusa em vez de sumir com a biometria.
    expect(rec.measurementCounts).toEqual({ labels: nLabels, values: nValues })
  })

  it("peso zero é preenchimento de formulário, não peso: fica em branco", () => {
    expect(parseDarwinCore(bio('"Peso total"', '"0.0000"'), "1").necropsyWeightKg).toBeNull()
    expect(parseDarwinCore(bio('"Peso total"', '"85.5"'), "1").necropsyWeightKg).toBe(85.5)
  })
})

describe("matchWormsSpecies — falhas nunca bloqueiam a importação", () => {
  const accepted = {
    AphiaID: 137102,
    scientificname: "Sotalia guianensis",
    status: "accepted",
    family: "Delphinidae",
    order: "Cetartiodactyla",
  }

  it("consulta o match exato com o nome aparado e codificado", async () => {
    respond({ json: async () => [[accepted]] })
    await matchWormsSpecies("  Sotalia guianensis ")
    const url = calledUrl()
    expect(url.host).toBe("www.marinespecies.org")
    expect(url.searchParams.get("scientificnames[]")).toBe("Sotalia guianensis")
    expect(url.searchParams.get("marine_only")).toBe("false")
  })

  it("sinônimo aponta para o táxon válido (AphiaID e nome aceitos)", async () => {
    respond({
      json: async () => [
        [
          {
            ...accepted,
            AphiaID: 999,
            status: "unaccepted",
            scientificname: "Sotalia brasiliensis",
            valid_AphiaID: 137102,
            valid_name: "Sotalia guianensis",
          },
        ],
      ],
    })
    await expect(matchWormsSpecies("Sotalia brasiliensis")).resolves.toEqual({
      wormsAphiaId: 137102,
      taxonFamily: "Delphinidae",
      taxonOrder: "Cetartiodactyla",
      acceptedName: "Sotalia guianensis",
    })
  })

  it("família e ordem ausentes viram null", async () => {
    respond({ json: async () => [[{ AphiaID: 5, scientificname: "X y", status: "accepted" }]] })
    await expect(matchWormsSpecies("X y z")).resolves.toEqual({
      wormsAphiaId: 5,
      taxonFamily: null,
      taxonOrder: null,
      acceptedName: "X y",
    })
  })

  it.each([
    ["204 (sem correspondência)", { status: 204 }],
    ["erro HTTP", { status: 500 }],
    ["corpo null", { json: async () => null }],
    ["corpo que não é lista", { json: async () => ({ error: "x" }) }],
    ["lista de nomes vazia", { json: async () => [] }],
    ["nome sem registros", { json: async () => [[]] }],
    ["registro sem AphiaID", { json: async () => [[{ scientificname: "X", status: "accepted" }]] }],
    [
      "JSON malformado",
      {
        json: async () => {
          throw new SyntaxError("Unexpected token <")
        },
      },
    ],
  ] as [string, FakeResponse][])("%s → null", async (_label, response) => {
    respond(response)
    await expect(matchWormsSpecies("Sotalia guianensis")).resolves.toBeNull()
  })

  it("timeout ou queda de rede → null", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"))
    await expect(matchWormsSpecies("Sotalia guianensis")).resolves.toBeNull()
  })
})

// O cache em memória é por caminho: cada teste usa um país próprio para não herdar resposta.
describe("CountryStateCity", () => {
  it("envia a chave no cabeçalho e o ISO em maiúsculas no caminho", async () => {
    respond({ json: async () => [{ id: 1, name: "Acre", iso2: "AC", extra: "descartado" }] })
    await expect(getStates("aa")).resolves.toEqual([{ id: 1, name: "Acre", iso2: "AC" }])
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.countrystatecity.in/v1/countries/AA/states",
    )
    expect(calledHeaders()["X-CSCAPI-KEY"]).toBe("csc-key")
  })

  it("a segunda consulta do mesmo país sai do cache, sem nova chamada", async () => {
    respond({ json: async () => [{ id: 1, name: "Bahia", iso2: "BA" }] })
    await getStates("AB")
    await getStates("ab")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("erro HTTP é propagado com o status e NÃO fica em cache", async () => {
    respond({ status: 401 })
    await expect(getStates("AC")).rejects.toThrow("CountryStateCity respondeu 401")
    respond({ json: async () => [] })
    await expect(getStates("AC")).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("sem chave configurada falha antes de chamar a API", async () => {
    env.CSC_API_KEY = undefined
    await expect(getCities("AD", "X1")).rejects.toThrow("CSC_API_KEY não configurada")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("timeout da API é propagado (a rota decide o fallback)", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"))
    await expect(getCities("AE", "X1")).rejects.toThrow("timeout")
  })

  it("cidades: caminho com país e estado, só id e nome no retorno", async () => {
    respond({ json: async () => [{ id: 7, name: "Itajaí", latitude: "-26.9" }] })
    await expect(getCities("af", "sc")).resolves.toEqual([{ id: 7, name: "Itajaí" }])
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.countrystatecity.in/v1/countries/AF/states/SC/cities",
    )
  })
})

describe("parser do NCBI — bordas", () => {
  it("resposta sem táxons devolve lista vazia", () => {
    expect(parseNcbiTaxa("")).toEqual([])
    expect(parseNcbiTaxa("<TaxaSet></TaxaSet>")).toEqual([])
    expect(parseNcbiTaxa("<html>Service unavailable</html>")).toEqual([])
  })

  it("descarta táxon sem nome ou com TaxId inválido", () => {
    const xml =
      "<TaxaSet>" +
      "<Taxon><TaxId>10</TaxId><Rank>species</Rank></Taxon>" +
      "<Taxon><TaxId>abc</TaxId><ScientificName>Sem id</ScientificName></Taxon>" +
      "<Taxon><TaxId>0</TaxId><ScientificName>Zero</ScientificName></Taxon>" +
      "<Taxon><TaxId>29461</TaxId><ScientificName>Brucella ceti</ScientificName></Taxon>" +
      "</TaxaSet>"
    expect(parseNcbiTaxa(xml)).toEqual([
      { key: 29461, scientificName: "Brucella ceti", rank: null, family: null, order: null },
    ])
  })

  it("bloco truncado (sem fechamento) não entra", () => {
    expect(topLevelTaxa("<TaxaSet><Taxon><TaxId>1</TaxId>")).toEqual([])
  })

  it("firstTag e lineageName devolvem null quando a tag não existe", () => {
    expect(firstTag("<a>1</a>", "TaxId")).toBeNull()
    expect(firstTag("<TaxId> 42 </TaxId>", "TaxId")).toBe("42")
    expect(lineageName("<ScientificName>X</ScientificName><Rank>genus</Rank>", "family")).toBeNull()
  })
})
