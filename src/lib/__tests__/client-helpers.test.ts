// Helpers do lado do cliente que têm lógica própria: o cliente HTTP (erro → ApiError), a
// tradução de erros da API, a tabela client-side (busca + ordenação) e o download da
// exportação. React, next-intl, axios e o DOM são simulados — o alvo é a regra, não o render.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── axios ────────────────────────────────────────────────────────────────────
const axiosRequest = vi.fn()
vi.mock("axios", () => ({
  default: {
    create: () => ({ request: (config: unknown) => axiosRequest(config) }),
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean } | null)?.isAxiosError,
  },
}))

// ── next-intl ────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, string>) =>
    `${ns}.${key}${params ? JSON.stringify(params) : ""}`,
}))

// ── react: useState mínimo, com estado persistente entre "renders" do mesmo teste ─────────
const hook = { slots: [] as unknown[], cursor: 0 }
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = hook.cursor++
    if (!(i in hook.slots)) hook.slots[i] = initial
    const set = (next: unknown) => {
      hook.slots[i] =
        typeof next === "function" ? (next as (p: unknown) => unknown)(hook.slots[i]) : next
    }
    return [hook.slots[i], set]
  },
}))

const { ApiError, apiErrorBody, http } = await import("@/lib/http")
// Importados com outro nome: aqui os hooks são chamados como funções comuns, fora de um componente.
const { useErrorMessage: errorMessageHook } = await import("@/lib/use-error-message")
const { useTable: tableHook } = await import("@/lib/use-table")
const { downloadAnimalsExport } = await import("@/lib/export-download")

beforeEach(() => {
  axiosRequest.mockReset()
  hook.slots = []
  hook.cursor = 0
})
afterEach(() => vi.unstubAllGlobals())

describe("http — cliente das chamadas à API", () => {
  it("devolve o corpo da resposta já desembrulhado", async () => {
    axiosRequest.mockResolvedValue({ data: { id: "a1" } })
    await expect(http.get("/api/animals/a1")).resolves.toEqual({ id: "a1" })
  })

  it.each([
    ["get", () => http.get("/x", { params: { q: "1" } }), { method: "GET", params: { q: "1" } }],
    ["post", () => http.post("/x", { a: 1 }), { method: "POST", data: { a: 1 } }],
    ["put", () => http.put("/x", { a: 2 }), { method: "PUT", data: { a: 2 } }],
    ["patch", () => http.patch("/x", { a: 3 }), { method: "PATCH", data: { a: 3 } }],
    ["del", () => http.del("/x"), { method: "DELETE" }],
  ])("%s envia o método e o corpo certos", async (_name, call, expected) => {
    axiosRequest.mockResolvedValue({ data: null })
    await call()
    expect(axiosRequest).toHaveBeenCalledWith(expect.objectContaining({ url: "/x", ...expected }))
  })

  it("postForm envia o FormData sem forçar Content-Type (o boundary é do axios)", async () => {
    axiosRequest.mockResolvedValue({ data: { ok: true } })
    const form = new FormData()
    await http.postForm("/upload", form)
    const config = axiosRequest.mock.calls[0]![0] as Record<string, unknown>
    expect(config).toEqual({ method: "POST", url: "/upload", data: form })
  })

  it("resposta de erro vira ApiError com status e o corpo do servidor", async () => {
    const body = { error: "Animal não encontrado", code: "animalNotFound" }
    axiosRequest.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: body } })
    const err = await http.get("/x").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 404, body, message: "HTTP 404", name: "ApiError" })
  })

  it.each([
    ["rede/timeout (erro do axios sem resposta)", { isAxiosError: true }],
    ["erro qualquer", new Error("boom")],
  ])("%s vira ApiError de status 0, sem corpo", async (_label, failure) => {
    axiosRequest.mockRejectedValue(failure)
    const err = await http.post("/x", {}).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 0, body: null })
  })

  it("apiErrorBody extrai o corpo de um ApiError e ignora o resto", () => {
    expect(apiErrorBody(new ApiError(409, { code: "conflict" }))).toEqual({ code: "conflict" })
    expect(apiErrorBody(new Error("x"))).toBeNull()
    expect(apiErrorBody(undefined)).toBeNull()
  })
})

describe("useErrorMessage — tradução do erro da API", () => {
  const message = () => errorMessageHook()

  it("código conhecido é traduzido pelo namespace errors", () => {
    expect(message()({ code: "animalNotFound", error: "Animal não encontrado" })).toBe(
      "errors.animalNotFound",
    )
  })

  it("os params interpolam a mensagem traduzida", () => {
    expect(
      message()({ code: "animalControlDuplicateInResearch", params: { research: "Cetáceos" } }),
    ).toBe('errors.animalControlDuplicateInResearch{"research":"Cetáceos"}')
  })

  it("código desconhecido cai para a mensagem literal do servidor", () => {
    expect(message()({ code: "codigoNovo", error: "Texto do servidor" })).toBe("Texto do servidor")
  })

  it("aceita o ApiError capturado, não só o corpo", () => {
    expect(message()(new ApiError(403, { code: "forbidden" }))).toBe("errors.forbidden")
  })

  it.each([
    ["erro de validação do zod (objeto, não texto)", { error: { fieldErrors: {} } }],
    ["corpo nulo (falha de rede)", null],
    ["ApiError sem corpo", new ApiError(0, null)],
  ])("%s não gera mensagem", (_label, input) => {
    expect(message()(input)).toBeUndefined()
  })
})

describe("useTable — busca e ordenação client-side", () => {
  type Row = { name: string; count: number }
  const rows: Row[] = [
    { name: "Baço", count: 10 },
    { name: "abdômen", count: 2 },
    { name: "Fígado", count: 30 },
    { name: "amostra 10", count: 5 },
    { name: "amostra 9", count: 5 },
  ]
  const opts = {
    columns: { name: (r: Row) => r.name, count: (r: Row) => r.count },
    search: (r: Row) => `${r.name} ${r.count}`,
    locale: "pt",
  }
  // Cada chamada é um "render": o cursor volta ao início e o estado persiste.
  const render = (o: Parameters<typeof tableHook<Row>>[1] = opts) => {
    hook.cursor = 0
    return tableHook(rows, o)
  }
  const names = (t: { rows: Row[] }) => t.rows.map((r) => r.name)

  it("sem busca nem ordenação mantém a ordem recebida, sem mutar a lista", () => {
    const t = render()
    expect(t.rows).toEqual(rows)
    expect(t.rows).not.toBe(rows)
    expect(t.sort).toBeNull()
  })

  it("a busca ignora caixa e espaços em volta, e olha todas as colunas", () => {
    render().setQuery("  FÍG ")
    expect(names(render())).toEqual(["Fígado"])
    render().setQuery("30")
    expect(names(render())).toEqual(["Fígado"])
    render().setQuery("nada casa")
    expect(render().rows).toEqual([])
  })

  it("texto ordena sem diferenciar caixa/acento e com números em ordem natural", () => {
    render().toggleSort("name")
    expect(names(render())).toEqual(["abdômen", "amostra 9", "amostra 10", "Baço", "Fígado"])
  })

  it("coluna numérica ordena por valor, não por texto", () => {
    render().toggleSort("count")
    expect(render().rows.map((r) => r.count)).toEqual([2, 5, 5, 10, 30])
  })

  it("clicar na mesma coluna inverte; clicar em outra recomeça em ascendente", () => {
    render().toggleSort("count")
    render().toggleSort("count")
    expect(render().sort).toEqual({ key: "count", dir: "desc" })
    expect(render().rows.map((r) => r.count)).toEqual([30, 10, 5, 5, 2])
    render().toggleSort("name")
    expect(render().sort).toEqual({ key: "name", dir: "asc" })
  })

  it("ordenação inicial vale desde o primeiro render (ascendente por padrão)", () => {
    const t = render({ ...opts, initialSort: { key: "count" } })
    expect(t.sort).toEqual({ key: "count", dir: "asc" })
    expect(t.rows[0]?.name).toBe("abdômen")
  })

  it("coluna de ordenação desconhecida é ignorada", () => {
    render().toggleSort("inexistente")
    expect(render().rows).toEqual(rows)
  })

  it("trocar a resetKey (ex.: mudar de aba) limpa busca e ordenação", () => {
    render({ ...opts, resetKey: "aba-1" }).setQuery("fíg")
    render({ ...opts, resetKey: "aba-1" }).toggleSort("count")
    expect(render({ ...opts, resetKey: "aba-1" }).rows).toHaveLength(1)

    render({ ...opts, resetKey: "aba-2" })
    const depois = render({ ...opts, resetKey: "aba-2" })
    expect(depois.query).toBe("")
    expect(depois.sort).toBeNull()
    expect(depois.rows).toHaveLength(rows.length)
  })
})

describe("downloadAnimalsExport", () => {
  function stubBrowser(response: Partial<Response> & { ok: boolean; status: number }) {
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() }
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>(async () => ({
      blob: async () => new Blob(["x"]),
      headers: new Headers(),
      ...response,
    }))
    const revoke = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mares/1"), revokeObjectURL: revoke })
    return { anchor, fetchMock, revoke }
  }

  it("envia os ids e o formato e salva com o nome vindo do servidor", async () => {
    const { anchor, fetchMock, revoke } = stubBrowser({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="MARES-2026-03.xlsx"' }),
    })
    await downloadAnimalsExport(["a1", "a2"], "xlsx")

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("/api/animals/export")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["a1", "a2"], format: "xlsx" })
    expect(anchor.download).toBe("MARES-2026-03.xlsx")
    expect(anchor.href).toBe("blob:mares/1")
    expect(anchor.click).toHaveBeenCalledTimes(1)
    // A URL temporária é liberada depois do clique (não vaza o blob na memória).
    expect(revoke).toHaveBeenCalledWith("blob:mares/1")
  })

  it.each([
    ["xlsx", "MARES-animais.xlsx"],
    ["darwin-core", "MARES-animais.xml"],
  ] as const)("sem nome no cabeçalho, %s usa o nome padrão %s", async (format, filename) => {
    const { anchor } = stubBrowser({ ok: true, status: 200 })
    await downloadAnimalsExport(["a1"], format)
    expect(anchor.download).toBe(filename)
  })

  it("resposta de erro interrompe o download com o status", async () => {
    const { anchor } = stubBrowser({ ok: false, status: 403 })
    await expect(downloadAnimalsExport(["a1"], "xlsx")).rejects.toThrow("export failed: 403")
    expect(anchor.click).not.toHaveBeenCalled()
  })
})
