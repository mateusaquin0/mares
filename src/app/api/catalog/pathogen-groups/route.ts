// MARES — Grupos de patógeno (para o select do modal). Leitura por qualquer autenticado.

import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { listPathogenGroups } from "@/lib/catalog"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    return NextResponse.json(await listPathogenGroups())
  } catch (err) {
    return apiError(err)
  }
}
