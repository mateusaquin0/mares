import { describe, it, expect, vi, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { z } from "zod"

import { apiError, assertSameOrigin, tooManyRequests, unauthorized } from "@/lib/api"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "@/lib/errors"
import { ERROR_CODES, KNOWN_ERROR_CODES } from "@/lib/error-codes"

afterEach(() => vi.restoreAllMocks())

describe("apiError — erro de domínio → resposta HTTP", () => {
  it.each([
    ["ValidationError", new ValidationError("ruim", ERROR_CODES.nameRequired), 422, "nameRequired"],
    ["ForbiddenError", new ForbiddenError(), 403, "forbidden"],
    ["NotFoundError", new NotFoundError("x", ERROR_CODES.animalNotFound), 404, "animalNotFound"],
    ["ConflictError", new ConflictError(), 409, "conflict"],
    [
      "ServiceUnavailableError",
      new ServiceUnavailableError("fora", ERROR_CODES.simbaUnavailable),
      503,
      "simbaUnavailable",
    ],
  ])("%s vira %i com o código estável", async (_name, err, status, code) => {
    const res = apiError(err)
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: err.message, code })
  })

  it("erro de validação do zod vira 422 com os campos achatados", async () => {
    const parsed = z.object({ name: z.string().min(3, "min3") }).safeParse({ name: "ab" })
    const res = apiError(parsed.error)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: { formErrors: [], fieldErrors: { name: ["min3"] } },
      code: "validation",
    })
  })

  // Os params interpolam a mensagem traduzida no cliente (`{research}`): sem eles o erro
  // "já cadastrado na pesquisa …" chegaria sem o nome da pesquisa.
  it("conflito leva os params de interpolação no corpo", async () => {
    const res = apiError(
      new ConflictError("dup", ERROR_CODES.animalControlDuplicateInResearch, {
        research: "Cetáceos SC",
      }),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "dup",
      code: "animalControlDuplicateInResearch",
      params: { research: "Cetáceos SC" },
    })
  })

  it("conflito sem params não inclui a chave", async () => {
    const body = (await apiError(new ConflictError("dup")).json()) as Record<string, unknown>
    expect("params" in body).toBe(false)
  })

  it("erro desconhecido vira 500 genérico, sem vazar a mensagem interna", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = apiError(new Error('relation "Animal" does not exist'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Erro interno", code: "internal" })
    expect(log).toHaveBeenCalledTimes(1)
  })

  it("valor lançado que não é Error também vira 500", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(apiError("string solta").status).toBe(500)
    expect(apiError(null).status).toBe(500)
  })
})

describe("unauthorized / tooManyRequests", () => {
  it("401 com o código de não autenticado", async () => {
    const res = unauthorized()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: "unauthenticated" })
  })

  it("429 informa em quantos segundos tentar de novo (Retry-After)", async () => {
    const res = tooManyRequests(42)
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("42")
    expect(await res.json()).toMatchObject({ code: "rateLimited" })
  })
})

// Uploads multipart são "simple requests": não passam por preflight CORS, então a origem é
// conferida no servidor.
describe("assertSameOrigin — proteção CSRF dos uploads", () => {
  const request = (headers: Record<string, string>) =>
    new NextRequest("https://mares.app/api/animals/a1/media", { method: "POST", headers })

  it("aceita Origin da própria aplicação", () => {
    expect(() =>
      assertSameOrigin(request({ origin: "https://mares.app", host: "mares.app" })),
    ).not.toThrow()
  })

  it("compara host COM porta", () => {
    expect(() =>
      assertSameOrigin(request({ origin: "http://localhost:3000", host: "localhost:3000" })),
    ).not.toThrow()
    expect(() =>
      assertSameOrigin(request({ origin: "http://localhost:4000", host: "localhost:3000" })),
    ).toThrow(ForbiddenError)
  })

  it.each([
    ["outro site", "https://evil.example"],
    ["subdomínio parecido", "https://mares.app.evil.example"],
    ["origem opaca (iframe sandbox)", "null"],
    ["origem malformada", "não é url"],
  ])("recusa %s", (_label, origin) => {
    expect(() => assertSameOrigin(request({ origin, host: "mares.app" }))).toThrow(ForbiddenError)
  })

  it("sem Origin, aceita o Referer da própria aplicação", () => {
    expect(() =>
      assertSameOrigin(request({ referer: "https://mares.app/app/animals/a1", host: "mares.app" })),
    ).not.toThrow()
  })

  it.each([
    ["Referer de outro site", { referer: "https://evil.example/form", host: "mares.app" }],
    ["Referer malformado", { referer: "::::", host: "mares.app" }],
    ["sem Origin nem Referer", { host: "mares.app" }],
  ])("sem Origin, recusa %s", (_label, headers) => {
    expect(() => assertSameOrigin(request(headers))).toThrow(ForbiddenError)
  })

  it("o erro carrega o código 'forbidden' (403 traduzível)", () => {
    try {
      assertSameOrigin(request({ origin: "https://evil.example", host: "mares.app" }))
      expect.unreachable("deveria ter recusado a origem")
    } catch (e) {
      expect((e as ForbiddenError).code).toBe("forbidden")
    }
  })
})

describe("erros de domínio — valores padrão", () => {
  it.each([
    [new NotFoundError(), "NotFoundError", "notFound"],
    [new ConflictError(), "ConflictError", "conflict"],
    [new ForbiddenError(), "ForbiddenError", "forbidden"],
    [new ValidationError(), "ValidationError", "validation"],
    [new ServiceUnavailableError(), "ServiceUnavailableError", "internal"],
  ])("%s tem nome e código próprios", (err, name, code) => {
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe(name)
    expect(err.code).toBe(code)
    expect(err.message.length).toBeGreaterThan(0)
  })

  it("conflito sem params deixa o campo indefinido", () => {
    expect(new ConflictError("x", "y").params).toBeUndefined()
  })
})

describe("códigos de erro", () => {
  it("cada chave é igual ao seu valor (o cliente traduz pelo próprio código)", () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) expect(value).toBe(key)
  })

  it("KNOWN_ERROR_CODES contém todos e só os códigos declarados", () => {
    expect(KNOWN_ERROR_CODES.size).toBe(Object.keys(ERROR_CODES).length)
    expect(KNOWN_ERROR_CODES.has("animalNotFound")).toBe(true)
    expect(KNOWN_ERROR_CODES.has("codigoInventado")).toBe(false)
  })
})
