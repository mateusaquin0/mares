// MARES — Aprovar uma solicitação de glossário (curador). Cria o item pela mesma lógica da
// criação direta. Se o nome já existir (corrida/duplicata), a solicitação é auto-rejeitada
// como duplicata e o conflito é propagado.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireCatalogReviewer } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { approveCatalogRequest } from "@/lib/catalog-requests"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireCatalogReviewer(user)

    const { id } = await params
    const result = await approveCatalogRequest(id, user.id)
    return NextResponse.json(result)
  } catch (err) {
    return apiError(err)
  }
}
