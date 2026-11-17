import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const SUPABASE_URL = "https://proj.supabase.co"

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  },
}))

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }
type CookieMethods = {
  getAll: () => { name: string; value: string }[]
  setAll: (cookies: CookieToSet[]) => void
}

// Sessão simulada: `sub` é o id do usuário no JWT; `refresh` simula o Supabase renovando o
// token durante o getClaims (ele grava os cookies novos pelo `setAll`).
const session: { sub: string | null; refresh: CookieToSet[] | null } = { sub: null, refresh: null }
const createServerClient = vi.fn(
  (_url: string, _key: string, opts: { cookies: CookieMethods }) => ({
    auth: {
      getClaims: async () => {
        opts.cookies.getAll()
        if (session.refresh) opts.cookies.setAll(session.refresh)
        return { data: session.sub ? { claims: { sub: session.sub } } : null }
      },
    },
  }),
)
vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, opts: { cookies: CookieMethods }) =>
    createServerClient(url, key, opts),
}))

const { buildCsp, generateNonce } = await import("@/lib/csp")
const { updateSession } = await import("@/lib/supabase/middleware")

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1)

beforeEach(() => {
  session.sub = null
  session.refresh = null
  createServerClient.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe("generateNonce", () => {
  it("gera um valor base64 diferente a cada requisição", () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(a).not.toBe(b)
  })
})

describe("buildCsp — política estrita de produção", () => {
  const csp = buildCsp("NONCE123", SUPABASE_URL)

  it("scripts só por nonce: sem 'unsafe-inline' nem 'unsafe-eval'", () => {
    expect(directive(csp, "script-src")).toBe("'self' 'nonce-NONCE123' 'strict-dynamic'")
  })

  it("conexões só para a própria origem e o Supabase (https e wss)", () => {
    expect(directive(csp, "connect-src")).toBe(
      "'self' https://proj.supabase.co wss://proj.supabase.co",
    )
  })

  it("imagens: tiles do OpenStreetMap e mídia assinada do Supabase", () => {
    expect(directive(csp, "img-src")).toBe(
      "'self' blob: data: https://*.tile.openstreetmap.org https://proj.supabase.co",
    )
  })

  it.each([
    ["default-src", "'self'"],
    ["frame-ancestors", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["font-src", "'self'"],
    ["worker-src", "'self' blob:"],
  ])("%s é %s", (name, value) => {
    expect(directive(csp, name)).toBe(value)
  })

  it("a barra final da URL do Supabase é descartada (origem, não caminho)", () => {
    const withSlash = buildCsp("n", "https://proj.supabase.co///")
    expect(directive(withSlash, "connect-src")).toBe(
      "'self' https://proj.supabase.co wss://proj.supabase.co",
    )
  })

  it("só o desenvolvimento libera eval e websocket do live-reload", () => {
    vi.stubEnv("NODE_ENV", "development")
    const dev = buildCsp("n", SUPABASE_URL)
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'")
    expect(directive(dev, "connect-src")).toContain(" ws:")

    vi.stubEnv("NODE_ENV", "production")
    const prod = buildCsp("n", SUPABASE_URL)
    expect(prod).not.toContain("unsafe-eval")
    expect(directive(prod, "connect-src")).not.toContain(" ws:")
  })
})

describe("updateSession — autenticação no middleware", () => {
  const request = (path: string) => new NextRequest(`https://mares.app${path}`)

  it("rotas de API passam direto: a sessão é validada no handler", async () => {
    const res = await updateSession(request("/api/animals"))
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("content-security-policy")).toBeNull()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it.each([
    "/",
    "/login",
    "/request-access",
    "/terms",
    "/map",
    "/auth/confirm",
    "/auth/set-password",
  ])("rota pública %s abre sem sessão", async (path) => {
    const res = await updateSession(request(path))
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
  })

  it.each(["/app", "/app/animals/a1", "/app/admin/users"])(
    "rota protegida %s sem sessão redireciona ao login preservando o destino",
    async (path) => {
      const res = await updateSession(request(path))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get("location")!)
      expect(location.pathname).toBe("/login")
      expect(location.searchParams.get("redirectTo")).toBe(path)
    },
  )

  // Prefixo não é rota: "/mapa" e "/loginx" não podem herdar o acesso público de "/map" e "/login".
  it.each(["/mapa", "/loginx", "/termsofservice", "/authz"])(
    "%s NÃO é pública só por começar igual a uma rota pública",
    async (path) => {
      const res = await updateSession(request(path))
      expect(res.status).toBe(307)
    },
  )

  it("rota protegida com sessão válida segue adiante", async () => {
    session.sub = "user-1"
    const res = await updateSession(request("/app/animals"))
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
  })

  it("páginas recebem a CSP com um nonce novo por requisição", async () => {
    const first = (await updateSession(request("/login"))).headers.get("content-security-policy")!
    const second = (await updateSession(request("/login"))).headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/.exec(first)?.[1]
    expect(nonce).toBeTruthy()
    expect(first).toContain("https://proj.supabase.co")
    expect(/'nonce-([^']+)'/.exec(second)?.[1]).not.toBe(nonce)
  })

  // O Next lê o nonce do header da REQUISIÇÃO para aplicá-lo aos próprios <script>.
  it("o mesmo nonce vai no header da requisição repassada ao Next", async () => {
    const res = await updateSession(request("/login"))
    const csp = res.headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce)
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp)
  })

  it("token renovado: os cookies novos saem na resposta, que mantém a CSP", async () => {
    session.sub = "user-1"
    session.refresh = [{ name: "sb-access-token", value: "novo", options: { path: "/" } }]
    const res = await updateSession(request("/app/animals"))
    expect(res.status).toBe(200)
    expect(res.cookies.get("sb-access-token")?.value).toBe("novo")
    expect(res.headers.get("content-security-policy")).toContain("'nonce-")
  })

  it("usa a URL e a chave pública do Supabase (nunca a service role)", async () => {
    await updateSession(request("/login"))
    expect(createServerClient).toHaveBeenCalledWith(
      "https://proj.supabase.co",
      "anon-key",
      expect.anything(),
    )
  })
})
