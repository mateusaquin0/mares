import { describe, it, expect } from "vitest"
import { rateLimit, clientKey } from "@/lib/rate-limit"

// Cada teste usa uma chave única para não interferir no estado global do módulo.
let n = 0
const key = () => `test-${Date.now()}-${n++}`

describe("rateLimit", () => {
  it("permite requisições até o limite e bloqueia a seguinte", () => {
    const k = key()
    const opts = { limit: 3, windowMs: 1000 }
    expect(rateLimit(k, opts).ok).toBe(true)
    expect(rateLimit(k, opts).ok).toBe(true)
    expect(rateLimit(k, opts).ok).toBe(true)
    expect(rateLimit(k, opts).ok).toBe(false)
  })

  it("decrementa 'remaining' a cada requisição", () => {
    const k = key()
    const opts = { limit: 2, windowMs: 1000 }
    expect(rateLimit(k, opts).remaining).toBe(1)
    expect(rateLimit(k, opts).remaining).toBe(0)
  })

  it("informa retryAfter >= 1 quando bloqueado", () => {
    const k = key()
    const opts = { limit: 1, windowMs: 5000 }
    rateLimit(k, opts)
    const blocked = rateLimit(k, opts)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1)
  })

  it("mantém contadores independentes por chave", () => {
    const a = key()
    const b = key()
    const opts = { limit: 1, windowMs: 1000 }
    expect(rateLimit(a, opts).ok).toBe(true)
    expect(rateLimit(a, opts).ok).toBe(false)
    expect(rateLimit(b, opts).ok).toBe(true) // chave B não afetada por A
  })

  it("libera novamente após a janela expirar", async () => {
    const k = key()
    const opts = { limit: 1, windowMs: 30 }
    expect(rateLimit(k, opts).ok).toBe(true)
    expect(rateLimit(k, opts).ok).toBe(false)
    await new Promise((r) => setTimeout(r, 45))
    expect(rateLimit(k, opts).ok).toBe(true)
  })
})

describe("clientKey", () => {
  it("deriva a chave do primeiro IP de x-forwarded-for com prefixo", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    })
    expect(clientKey(req, "worms")).toBe("worms:203.0.113.7")
  })

  it("cai para x-real-ip quando não há forwarded-for", () => {
    const req = new Request("http://x/", { headers: { "x-real-ip": "198.51.100.9" } })
    expect(clientKey(req, "ncbi")).toBe("ncbi:198.51.100.9")
  })

  it("usa 'unknown' quando não há informação de IP", () => {
    const req = new Request("http://x/")
    expect(clientKey(req, "p")).toBe("p:unknown")
  })
})
