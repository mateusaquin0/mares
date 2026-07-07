import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Cabeçalhos de segurança aplicados a todas as respostas (ver auditoria de segurança).
// - frame-ancestors/X-Frame-Options: impedem que o app (inclusive o mapa público) seja
//   embutido em iframe de terceiros → protege contra clickjacking.
// - nosniff: impede o navegador de "adivinhar" o Content-Type (defesa p/ mídia servida).
// - Referrer-Policy / Permissions-Policy: reduzem vazamento de dados e desligam APIs não usadas.
// - HSTS: força HTTPS (efetivo em produção; ignorado pelo navegador em localhost).
// Obs.: uma CSP completa (script-src/style-src/img-src com nonce) fica como evolução —
// exige validação em runtime para não quebrar os scripts inline do Next e os tiles do mapa.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
