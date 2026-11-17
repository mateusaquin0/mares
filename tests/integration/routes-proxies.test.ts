import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, member, req, systemAdmin } from "./helpers/route"

// Chaves fixas e fictícias: nunca saem do processo (o `fetch` é substituído abaixo) e deixam
// o teste igual com ou sem as chaves reais no ambiente.
vi.hoisted(() => {
  process.env.CSC_API_KEY = "chave-csc-de-teste"
  process.env.NCBI_API_KEY = "chave-ncbi-de-teste"
  delete process.env.SIMBA_API_URL
  delete process.env.SIMBA_API_TOKEN
})

import { GET as simba } from "@/app/api/simba/route"
import { GET as worms } from "@/app/api/worms/route"
import { GET as ncbi } from "@/app/api/ncbi/route"
import { GET as geoStates } from "@/app/api/geo/countries/[ciso]/states/route"
import { GET as geoCities } from "@/app/api/geo/countries/[ciso]/states/[siso]/cities/route"

// Proxies para serviços externos (SIMBA, WoRMS, NCBI, CountryStateCity). Nenhuma chamada sai
// da máquina: o `fetch` global é um substituto que devolve o que o teste enfileirou e falha se
// for chamado sem resposta prevista. O que se confere é a parte do MARES: autenticação,
// limite de requisições, o que é pedido ao serviço e como a resposta (ou o erro) é devolvida.

type Reply = Response | Error
const queue: Reply[] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  void init
  const next = queue.shift()
  if (!next) throw new Error(`fetch inesperado nos testes: ${String(input)}`)
  if (next instanceof Error) throw next
  return next
})
vi.stubGlobal("fetch", fetchMock)

const reply = (...replies: Reply[]) => queue.push(...replies)
const jsonReply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const calledUrl = (n = 0) => String(fetchMock.mock.calls[n]![0])
const calledHeaders = (n = 0) =>
  (fetchMock.mock.calls[n]![1]?.headers ?? {}) as Record<string, string>

let ipSeq = 0
const ownIp = () => `10.88.${Math.floor(Math.random() * 250)}.${++ipSeq}`
const orgId = randomUUID()
// Sessões sem linha no banco: estas rotas só olham a sessão.
const researcher = () => member(randomUUID(), [orgId, "RESEARCHER"])

beforeEach(() => {
  queue.length = 0
  fetchMock.mockClear()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe("GET /api/simba", () => {
  const call = (query = "?record_number=12345") => simba(req(`/api/simba${query}`))
  const xml = `<?xml version="1.0"?>
<dwr:SimpleDarwinRecordSet>
  <dwr:SimpleDarwinRecord>
    <dwc:catalogNumber>12345</dwc:catalogNumber>
    <dwc:scientificName>Sotalia guianensis</dwc:scientificName>
    <dwc:eventDate>2024-05-10</dwc:eventDate>
    <dwc:decimalLatitude>-23.96</dwc:decimalLatitude>
    <dwc:decimalLongitude>-46.33</dwc:decimalLongitude>
    <dwc:municipality>Santos</dwc:municipality>
    <dwc:stateProvince>SP</dwc:stateProvince>
  </dwr:SimpleDarwinRecord>
</dwr:SimpleDarwinRecordSet>`
  const wormsMatch = [
    [
      {
        AphiaID: 344009,
        scientificname: "Sotalia guianensis",
        status: "accepted",
        family: "Delphinidae",
        order: "Cetartiodactyla",
        valid_AphiaID: 344009,
        valid_name: "Sotalia guianensis",
      },
    ],
  ]

  it("401 sem sessão e para o admin global (sem grupo ativo) — nada é consultado", async () => {
    login(null)
    expect((await call()).status).toBe(401)
    login(systemAdmin(randomUUID()))
    expect((await call()).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("devolve o registro do SIMBA enriquecido com o táxon do WoRMS", async () => {
    login(researcher())
    reply(new Response(xml, { status: 200 }), jsonReply(wormsMatch))
    const res = await call("?record_number=%2012345%20")
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({
      simbaRecordNumber: "12345",
      species: "Sotalia guianensis",
      eventDate: "2024-05-10",
      strandingLat: -23.96,
      strandingLon: -46.33,
      municipality: "Santos",
      state: "SP",
      wormsAphiaId: 344009,
      taxonFamily: "Delphinidae",
      taxonOrder: "Cetartiodactyla",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const simbaUrl = new URL(calledUrl(0))
    expect(simbaUrl.hostname).toBe("simba.petrobras.com.br")
    expect(simbaUrl.searchParams.get("record_number")).toBe("12345")
    expect(calledUrl(1)).toContain("marinespecies.org/rest/AphiaRecordsByMatchNames")
  })

  it("o WoRMS fora do ar não impede a prévia: a espécie do SIMBA volta sem táxon", async () => {
    login(researcher())
    reply(new Response(xml, { status: 200 }), new Error("timeout"))
    const res = await call()
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({
      species: "Sotalia guianensis",
      wormsAphiaId: null,
      taxonFamily: null,
      taxonOrder: null,
    })
  })

  it("422 sem número de registro", async () => {
    login(researcher())
    for (const query of ["", "?record_number=%20%20"]) {
      const res = await call(query)
      expect(res.status).toBe(422)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.validation)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("404 quando o SIMBA não tem o registro ou o registro vem sem espécie", async () => {
    login(researcher())
    reply(new Response("", { status: 404 }))
    const missing = await call()
    expect(missing.status).toBe(404)
    expect((await json<{ code: string }>(missing)).code).toBe(ERROR_CODES.simbaNotFound)

    reply(new Response("<dwr:SimpleDarwinRecordSet></dwr:SimpleDarwinRecordSet>", { status: 200 }))
    const empty = await call()
    expect(empty.status).toBe(404)
    expect((await json<{ code: string }>(empty)).code).toBe(ERROR_CODES.simbaNotFound)
  })

  it("503 quando o SIMBA responde com erro ou não responde", async () => {
    login(researcher())
    reply(new Response("erro", { status: 500 }))
    const failed = await call()
    expect(failed.status).toBe(503)
    expect((await json<{ code: string }>(failed)).code).toBe(ERROR_CODES.simbaUnavailable)

    reply(new Error("ECONNRESET"))
    const down = await call()
    expect(down.status).toBe(503)
    expect((await json<{ code: string }>(down)).code).toBe(ERROR_CODES.simbaUnavailable)
  })

  it("429 depois de 30 consultas do mesmo usuário em um minuto", async () => {
    login(researcher())
    for (let i = 0; i < 30; i++) expect((await call("")).status).toBe(422)
    const blocked = await call()
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await json<{ code: string }>(blocked)).code).toBe(ERROR_CODES.rateLimited)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("GET /api/worms", () => {
  const call = (q: string, ip = ownIp()) =>
    worms(req(`/api/worms?q=${encodeURIComponent(q)}`, { headers: { "x-forwarded-for": ip } }))
  const record = (i: number, status = "accepted") => ({
    AphiaID: 1000 + i,
    scientificname: `Sotalia sp${i}`,
    rank: "Species",
    status,
    family: "Delphinidae",
    order: "Cetartiodactyla",
  })

  it("401 sem sessão", async () => {
    login(null)
    expect((await call("Sotalia")).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("termo com menos de 3 letras devolve vazio sem consultar o serviço", async () => {
    login(researcher())
    const res = await call(" So ")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("mapeia os registros, põe os nomes aceitos primeiro e limita a 10", async () => {
    login(researcher())
    reply(
      jsonReply([record(0, "unaccepted"), ...Array.from({ length: 11 }, (_, i) => record(i + 1))]),
    )
    const res = await call("Sotalia guia")
    expect(res.status).toBe(200)
    const rows = await json<{ aphiaId: number; scientificName: string; status: string }[]>(res)
    expect(rows).toHaveLength(10)
    expect(rows.every((r) => r.status === "accepted")).toBe(true)
    expect(rows[0]).toEqual({
      aphiaId: 1001,
      scientificName: "Sotalia sp1",
      rank: "Species",
      status: "accepted",
      family: "Delphinidae",
      order: "Cetartiodactyla",
    })
    expect(calledUrl()).toContain(
      "marinespecies.org/rest/AphiaRecordsByName/Sotalia%20guia?like=true",
    )
  })

  it("sem resultado (204), erro do serviço ou corpo inesperado devolvem lista vazia", async () => {
    login(researcher())
    for (const upstream of [
      new Response(null, { status: 204 }),
      new Response("erro", { status: 503 }),
      jsonReply({ mensagem: "formato inesperado" }),
    ]) {
      reply(upstream)
      const res = await call("Sotalia")
      expect(res.status).toBe(200)
      expect(await json(res)).toEqual([])
    }
  })

  // BUG (baixa gravidade): serviço respondendo erro vira lista vazia, mas serviço que NÃO
  // responde (timeout de 8 s, rede) cai no erro genérico 500. O autocomplete deveria
  // degradar do mesmo jeito.
  it.fails("serviço sem resposta (timeout) também devolve lista vazia", async () => {
    login(researcher())
    reply(new Error("The operation was aborted due to timeout"))
    const res = await call("Sotalia")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([])
  })

  it("429 depois de 30 buscas do mesmo IP em um minuto; outro IP segue liberado", async () => {
    login(researcher())
    const ip = ownIp()
    for (let i = 0; i < 30; i++) expect((await call("So", ip)).status).toBe(200)
    const blocked = await call("So", ip)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await call("So")).status).toBe(200)
  })
})

describe("GET /api/ncbi", () => {
  const call = (q: string, ip = ownIp()) =>
    ncbi(req(`/api/ncbi?q=${encodeURIComponent(q)}`, { headers: { "x-forwarded-for": ip } }))
  const taxaXml = `<TaxaSet>
<Taxon>
  <TaxId>5811</TaxId>
  <ScientificName>Toxoplasma gondii</ScientificName>
  <Rank>species</Rank>
  <LineageEx>
    <Taxon><TaxId>5809</TaxId><ScientificName>Sarcocystidae</ScientificName><Rank>family</Rank></Taxon>
    <Taxon><TaxId>75739</TaxId><ScientificName>Eucoccidiorida</ScientificName><Rank>order</Rank></Taxon>
  </LineageEx>
</Taxon>
</TaxaSet>`

  it("401 sem sessão", async () => {
    login(null)
    expect((await call("Toxoplasma")).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("termo curto devolve vazio sem consultar o serviço", async () => {
    login(researcher())
    expect(await json(await call("To"))).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("busca os ids (esearch), a linhagem (efetch) e devolve os táxons", async () => {
    login(researcher())
    reply(jsonReply({ esearchresult: { idlist: ["5811"] } }), new Response(taxaXml))
    const res = await call("Toxoplasma")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([
      {
        key: 5811,
        scientificName: "Toxoplasma gondii",
        rank: "species",
        family: "Sarcocystidae",
        order: "Eucoccidiorida",
      },
    ])

    const search = new URL(calledUrl(0))
    expect(search.hostname).toBe("eutils.ncbi.nlm.nih.gov")
    expect(search.pathname).toContain("esearch.fcgi")
    expect(search.searchParams.get("term")).toBe("Toxoplasma*")
    expect(search.searchParams.get("api_key")).toBe("chave-ncbi-de-teste")
    const fetchUrl = new URL(calledUrl(1))
    expect(fetchUrl.pathname).toContain("efetch.fcgi")
    expect(fetchUrl.searchParams.get("id")).toBe("5811")
  })

  it("sem ids não há segunda consulta; erro em qualquer etapa devolve lista vazia", async () => {
    login(researcher())
    reply(jsonReply({ esearchresult: { idlist: [] } }))
    expect(await json(await call("Inexistentus"))).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    reply(new Response("erro", { status: 500 }))
    expect(await json(await call("Toxoplasma"))).toEqual([])

    reply(jsonReply({ esearchresult: { idlist: ["5811"] } }), new Response("erro", { status: 502 }))
    const res = await call("Toxoplasma")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([])
  })

  // BUG (baixa gravidade): mesma inconsistência do WoRMS — timeout/rede vira 500 genérico.
  it.fails("serviço sem resposta (timeout) também devolve lista vazia", async () => {
    login(researcher())
    reply(new Error("The operation was aborted due to timeout"))
    const res = await call("Toxoplasma")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([])
  })

  it("429 depois de 20 buscas do mesmo IP em um minuto", async () => {
    login(researcher())
    const ip = ownIp()
    for (let i = 0; i < 20; i++) expect((await call("To", ip)).status).toBe(200)
    const blocked = await call("Toxoplasma", ip)
    expect(blocked.status).toBe(429)
    expect((await json<{ code: string }>(blocked)).code).toBe(ERROR_CODES.rateLimited)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("GET /api/geo/countries/[ciso]/states e .../cities", () => {
  const states = (ciso: string) =>
    geoStates(req(`/api/geo/countries/${ciso}/states`), ctx({ ciso }))
  const cities = (ciso: string, siso: string) =>
    geoCities(req(`/api/geo/countries/${ciso}/states/${siso}/cities`), ctx({ ciso, siso }))
  // O cliente guarda as respostas na memória do processo: cada teste usa um país próprio.
  let countrySeq = 0
  const country = () => `t${++countrySeq}`

  it("401 sem sessão", async () => {
    login(null)
    expect((await states("BR")).status).toBe(401)
    expect((await cities("BR", "SP")).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("estados: ordenados por nome, só os campos usados, com a chave no cabeçalho", async () => {
    login(researcher())
    const ciso = country()
    reply(
      jsonReply([
        { id: 2, name: "São Paulo", iso2: "SP", country_id: 31 },
        { id: 1, name: "Bahia", iso2: "BA", country_id: 31 },
      ]),
    )
    const res = await states(ciso)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([
      { id: 1, name: "Bahia", iso2: "BA" },
      { id: 2, name: "São Paulo", iso2: "SP" },
    ])
    expect(res.headers.get("cache-control")).toContain("private")
    expect(calledUrl()).toBe(
      `https://api.countrystatecity.in/v1/countries/${ciso.toUpperCase()}/states`,
    )
    expect(calledHeaders()["X-CSCAPI-KEY"]).toBe("chave-csc-de-teste")

    // Segunda leitura vem da memória: o serviço não é consultado de novo.
    expect((await states(ciso)).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("cidades: ordenadas por nome, só id e nome", async () => {
    login(researcher())
    const ciso = country()
    reply(
      jsonReply([
        { id: 20, name: "Santos", latitude: "-23.9" },
        { id: 10, name: "Bertioga", latitude: "-23.8" },
      ]),
    )
    const res = await cities(ciso, "sp")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([
      { id: 10, name: "Bertioga" },
      { id: 20, name: "Santos" },
    ])
    expect(calledUrl()).toBe(
      `https://api.countrystatecity.in/v1/countries/${ciso.toUpperCase()}/states/SP/cities`,
    )
  })

  it("código fora do formato devolve vazio sem consultar o serviço", async () => {
    login(researcher())
    expect(await json(await states("../x"))).toEqual([])
    expect(await json(await cities("BR", "SP?x=1"))).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("erro do serviço não é devolvido como sucesso nem fica na memória", async () => {
    login(researcher())
    const ciso = country()
    reply(new Response("limite excedido", { status: 429 }))
    const failed = await states(ciso)
    expect(failed.status).toBeGreaterThanOrEqual(500)
    expect(await json(failed)).not.toHaveProperty("0")

    reply(jsonReply([{ id: 1, name: "Bahia", iso2: "BA" }]))
    const ok = await states(ciso)
    expect(ok.status).toBe(200)
    expect(await json(ok)).toEqual([{ id: 1, name: "Bahia", iso2: "BA" }])
  })

  it("429 depois de 60 consultas do mesmo usuário em um minuto (estados e cidades somam)", async () => {
    login(researcher())
    for (let i = 0; i < 30; i++) {
      expect((await states("!!")).status).toBe(200)
      expect((await cities("!!", "!!")).status).toBe(200)
    }
    const blockedStates = await states("BR")
    expect(blockedStates.status).toBe(429)
    expect(Number(blockedStates.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await cities("BR", "SP")).status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
