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

  // Com sessão: descobre se é admin global e se tem algum vínculo (Membership)
  // numa única chamada — o count de memberships vem embutido (embed do PostgREST).
  const { data: dbUser } = await supabase
    .from("User")
    .select("isSystemAdmin, memberships:Membership(count)")
    .eq("id", userId)
    .maybeSingle()

  const isAdmin = dbUser?.isSystemAdmin === true
  const membershipCount = (dbUser?.memberships as { count: number }[] | null)?.[0]?.count ?? 0
  const hasOrg = membershipCount > 0

  // Área de admin global exige isSystemAdmin
  if (pathname.startsWith("/app/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url))
  }

  // Usuário sem organização (e que não é admin global) → tela dedicada.
  // Exceção: o próprio perfil continua acessível (para editar dados ou excluir a conta).
  if (
    !hasOrg &&
    !isAdmin &&
    pathname !== "/app/no-organization" &&
    !pathname.startsWith("/app/profile")
  ) {
    return NextResponse.redirect(new URL("/app/no-organization", request.url))
  }

  return response
}
