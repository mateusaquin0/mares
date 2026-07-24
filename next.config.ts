import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

// Cabeçalhos de segurança aplicados a todas as respostas (ver auditoria de segurança).
// - X-Frame-Options: impede que o app (inclusive o mapa público) seja embutido em iframe
//   de terceiros → protege contra clickjacking (a CSP frame-ancestors reforça isso).
// - nosniff: impede o navegador de "adivinhar" o Content-Type (defesa p/ mídia servida).
// - Referrer-Policy / Permissions-Policy: reduzem vazamento de dados e desligam APIs não usadas.
// - HSTS: força HTTPS (efetivo em produção; ignorado pelo navegador em localhost).
// Obs.: a Content-Security-Policy NÃO fica aqui — ela é montada por requisição no middleware
// (src/lib/supabase/middleware.ts) com um nonce, para poder liberar os scripts inline do Next
// sem 'unsafe-inline'. Ver docs/MIDDLEWARE.md §CSP.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
]

const nextConfig: NextConfig = {
  // Não divulga a stack (remove o header `X-Powered-By: Next.js`) → menos fingerprinting.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default withNextIntl(nextConfig)
