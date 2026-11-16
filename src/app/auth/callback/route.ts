// MARES — Callback de autenticação do Supabase
// Troca o `code` (fluxo PKCE / confirmação de e-mail) por uma sessão e redireciona.

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const nextParam = searchParams.get("next")
  // Só caminho interno: "@host", "//host" e "/\host" levariam a pessoa para fora do domínio.
  const next = nextParam && /^\/(?![/\\])/.test(nextParam) ? nextParam : "/app/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
