// MARES — Confirmação de links de e-mail (convite e recuperação de senha).
// Aceita `token_hash` (verifyOtp, convites gerados no servidor) ou `code`
// (exchangeCodeForSession, fluxo PKCE). Grava a sessão diretamente na resposta de
// redirect e leva o usuário a definir a senha. Ver docs/CADASTRO_E_ACESSO.md §6.

import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { EmailOtpType } from "@supabase/supabase-js"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/auth/set-password"

  // A resposta é criada antes para que os cookies da sessão sejam anexados a ela.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split("; ")
            .map((c) => {
              const [name, ...rest] = c.split("=")
              return { name, value: rest.join("=") }
            }) ?? []
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let ok = false
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  }

  if (ok) return response
  return NextResponse.redirect(`${origin}/login?error=link-invalido`)
}
