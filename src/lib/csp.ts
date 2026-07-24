// MARES — Content-Security-Policy montada por requisição (com nonce).
//
// Por que aqui e não no next.config: uma CSP realmente útil contra XSS precisa liberar os
// scripts inline do Next por NONCE (não por 'unsafe-inline', que anularia a proteção). O nonce
// muda a cada requisição, então a política é montada no middleware e injetada tanto no header
// de resposta quanto no header da requisição (o Next lê esse header e aplica o mesmo nonce aos
// seus <script>). Ver docs/MIDDLEWARE.md §CSP.
//
// Hosts externos liberados (o mínimo que o cliente realmente usa):
//  - tiles do OpenStreetMap (img) — mapas público e da organização;
//  - Supabase (connect/img) — refresh de sessão do Auth e URLs assinadas de mídia.

/** Gera um nonce aleatório (base64) para uso em `script-src 'nonce-…'`. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64")
}

/**
 * Monta o valor da Content-Security-Policy para uma requisição.
 * @param nonce       nonce desta requisição (aplicado aos scripts inline do Next).
 * @param supabaseUrl origem do projeto Supabase (https://…); libera connect/img para o Auth
 *                    e para as URLs assinadas de mídia. `wss:` cobre o Realtime, se usado.
 */
export function buildCsp(nonce: string, supabaseUrl: string): string {
  const isDev = process.env.NODE_ENV === "development"
  const supabase = supabaseUrl.replace(/\/+$/, "")
  const supabaseWss = supabase.replace(/^https:/, "wss:")

  // Em desenvolvimento o Next usa eval (HMR) e um websocket para live-reload; liberamos o
  // suficiente para não quebrar `npm run dev`. Em produção a política é estrita.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", isDev ? "'unsafe-eval'" : ""]
    .filter(Boolean)
    .join(" ")

  const connectSrc = ["'self'", supabase, supabaseWss, isDev ? "ws:" : ""].filter(Boolean).join(" ")

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Estilos: Next, Leaflet e Recharts injetam estilos inline (atributos style). 'unsafe-inline'
    // aqui tem risco baixo (não permite execução de script) e evita quebrar a UI.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://*.tile.openstreetmap.org ${supabase}`,
    `font-src 'self'`,
    `connect-src ${connectSrc}`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ]

  return directives.join("; ")
}
