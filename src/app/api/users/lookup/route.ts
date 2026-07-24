// MARES — Busca um usuário da plataforma por e-mail (para o convite de membro).
// Se o e-mail já pertence a alguém, o admin reaproveita a conta existente e não precisa
// redigitar o nome. Restrito a admins de organização (quem pode convidar). Ver #2 do roadmap.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireAnyOrgAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { ValidationError } from "@/lib/errors"

// Valida formato básico de e-mail (evita varredura por strings arbitrárias).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireAnyOrgAdmin(user)

    const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim()
    // Limite RFC 5321 (254) antes do regex: entradas longas com muitos "." causariam
    // backtracking polinomial (ReDoS). Capar o tamanho elimina o problema e é validação correta.
    if (!email || email.length > 254 || !EMAIL_RE.test(email))
      throw new ValidationError("E-mail inválido")

    const found = await prisma.user.findUnique({
      where: { email },
      select: { name: true, isSystemAdmin: true },
    })

    // Admin da aplicação não participa de organizações — não é convidável como membro.
    if (!found || found.isSystemAdmin) return NextResponse.json({ exists: false, name: null })
    return NextResponse.json({ exists: true, name: found.name })
  } catch (err) {
    return apiError(err)
  }
}
