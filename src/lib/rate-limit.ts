// MARES — Rate limiting simples em memória (sliding-window log).
//
// Protege rotas sensíveis contra abuso: a rota pública de solicitação de acesso
// (grava no banco sem autenticação) e os proxies para APIs externas (WoRMS, NCBI,
// CountryStateCity), que consomem cota/chaves de terceiros.
//
// Limitação conhecida (documentada em docs/ARQUITETURA_BACKEND.md): o estado vive na
// memória do processo. Em um deploy com múltiplas instâncias serverless o limite passa
// a ser "por instância", não global. Para o escopo do TCC (instância única) é suficiente;
// em produção de larga escala trocar por um store compartilhado (ex.: Redis/Upstash)
// mantendo esta mesma interface.

type Bucket = number[] // timestamps (ms) das requisições dentro da janela

const buckets = new Map<string, Bucket>()

// Varredura periódica para descartar chaves ociosas e evitar crescimento ilimitado
// do Map. Usa a maior janela vista para não expirar buckets ainda relevantes.
let maxWindowMs = 60_000
let sweepTimer: ReturnType<typeof setInterval> | null = null

function ensureSweeper() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    const cutoff = Date.now() - maxWindowMs
    for (const [key, hits] of buckets) {
      const alive = hits.filter((t) => t > cutoff)
      if (alive.length === 0) buckets.delete(key)
      else buckets.set(key, alive)
    }
  }, 60_000)
  // Não segura o processo vivo por causa do timer (Node).
  sweepTimer.unref?.()
}

export type RateLimitOptions = {
  /** Máximo de requisições permitidas dentro da janela. */
  limit: number
  /** Tamanho da janela em milissegundos. */
  windowMs: number
}

export type RateLimitResult = {
  ok: boolean
  /** Requisições ainda disponíveis na janela atual. */
  remaining: number
  /** Segundos até liberar uma nova requisição (só quando `ok === false`). */
  retryAfter: number
}

/**
 * Registra uma requisição para `key` e informa se ela deve ser permitida.
 * Implementa um sliding-window log: mantém os timestamps dentro da janela e
 * bloqueia quando o total atinge `limit`.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  ensureSweeper()
  maxWindowMs = Math.max(maxWindowMs, opts.windowMs)

  const now = Date.now()
  const windowStart = now - opts.windowMs
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart)

  if (hits.length >= opts.limit) {
    const retryAfter = Math.ceil((hits[0]! + opts.windowMs - now) / 1000) // hits.length >= limit >= 1
    buckets.set(key, hits)
    return { ok: false, remaining: 0, retryAfter: Math.max(1, retryAfter) }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { ok: true, remaining: opts.limit - hits.length, retryAfter: 0 }
}

/**
 * Deriva a chave de identificação do cliente a partir do IP (proxy da Vercel/Next
 * preenche `x-forwarded-for`). Use `prefix` para separar limites por rota.
 */
export function clientKey(req: Request, prefix: string): string {
  const fwd = req.headers.get("x-forwarded-for")
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  return `${prefix}:${ip}`
}
