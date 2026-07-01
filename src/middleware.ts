// MARES — Middleware de autenticação (Next.js)
// Intercepta as requisições, atualiza a sessão do Supabase e protege as rotas.

import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos estáticos e imagens otimizadas
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
