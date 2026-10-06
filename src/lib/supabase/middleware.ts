// MARES — Atualização de sessão e proteção de rotas no middleware

import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/env"
import { buildCsp, generateNonce } from "@/lib/csp"

// Rotas públicas (não exigem sessão)
// (Rotas /api são tratadas antes desta lista — validam a sessão nos handlers.)
const PUBLIC_PATHS = ["/login", "/request-access", "/terms", "/map", "/auth"]

function isPublic(pathname: string) {
  if (pathname === "/") return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Rotas de API validam a sessão nelas mesmas (getAuthUser → getClaims) e, por
  // serem Route Handlers, gravam o cookie de refresh na própria resposta.
  // Retornar antes evita um getClaims() redundante por chamada de API — a principal
  // fonte de latência em /api/*. (Respostas JSON não precisam de CSP.)
  if (pathname.startsWith("/api")) return NextResponse.next({ request })

  // CSP por requisição: um nonce novo é aplicado aos scripts inline do Next. O nonce vai
  // no header da REQUISIÇÃO (o Next lê e reaplica aos seus <script>) e no header da RESPOSTA
  // (o navegador aplica a política). Ver src/lib/csp.ts e docs/MIDDLEWARE.md §CSP.
  const nonce = generateNonce()
  const csp = buildCsp(nonce, env.NEXT_PUBLIC_SUPABASE_URL)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("content-security-policy", csp)

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          response.headers.set("content-security-policy", csp)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Verifica o JWT localmente (chaves assimétricas ES256): getClaims() valida
  // assinatura + expiração com a JWKS cacheada, sem round-trip ao Auth server.
  // A chamada acima (getClaims lê os cookies e pode refrescar a sessão) mantém
  // a renovação do token; aqui só extraímos o id do usuário do token verificado.
  const { data: jwt } = await supabase.auth.getClaims()
  const userId = jwt?.claims.sub

  if (isPublic(pathname)) return response

  // Sem sessão → login (preservando destino)
  if (!userId) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(url)
  }

  // O middleware trata AUTENTICAÇÃO. A AUTORIZAÇÃO (admin global, vínculo com organização)
  // fica nos layouts de Server Component:
  //   - admin global            → src/app/app/admin/layout.tsx
  //   - vínculo com organização → src/app/app/layout.tsx
  //
  // Dois motivos para não fazer isso aqui. (1) Segurança: autorização na borda é o padrão
  // que a CVE-2025-29927 do Next.js explorou, em que um header forjado pulava o middleware
  // por completo — no layout a checagem acontece junto do render, onde os dados estão.
  // (2) Custo: a consulta que ficava aqui rodava em TODA requisição, inclusive nos prefetch
  // de <Link>; uma única carga de página com a sidebar disparava ~10 SELECTs idênticos.
  // Nos layouts, getAuthUser é memoizado por requisição (React.cache) e custa uma consulta.
  return response
}
