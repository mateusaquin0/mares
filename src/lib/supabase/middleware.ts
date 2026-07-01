// MARES — Atualização de sessão e proteção de rotas no middleware

import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Rotas públicas (não exigem sessão)
const PUBLIC_PATHS = [
  "/login",
  "/request-access",
  "/terms",
  "/map",
  "/auth",
  "/api/public",
  "/api/access-requests",
]

function isPublic(pathname: string) {
  if (pathname === "/") return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: getUser() revalida o token (não confie em getSession() no middleware)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (isPublic(pathname)) return response

  // Rotas de API (exceto públicas) fazem sua própria validação e retornam JSON.
  if (pathname.startsWith("/api")) return response

  // Sem sessão → login (preservando destino)
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(url)
  }

  // Com sessão: descobre se é admin global e se tem algum vínculo (Membership).
  const [{ data: dbUser }, { count }] = await Promise.all([
    supabase.from("User").select("isSystemAdmin").eq("id", user.id).maybeSingle(),
    supabase
      .from("Membership")
      .select("id", { count: "exact", head: true })
      .eq("userId", user.id),
  ])

  const isAdmin = dbUser?.isSystemAdmin === true
  const hasOrg = (count ?? 0) > 0

  // Área de admin global exige isSystemAdmin
  if (pathname.startsWith("/app/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url))
  }

  // Usuário sem organização (e que não é admin global) → tela dedicada
  if (!hasOrg && !isAdmin && pathname !== "/app/no-organization") {
    return NextResponse.redirect(new URL("/app/no-organization", request.url))
  }

  return response
}
