// MARES — Endpoint público de animais para o mapa (Fase 4).
// Sem autenticação: expõe apenas dados públicos (animal.isPublic AND research.isPublic),
// conforme docs/PERMISSOES.md. Ver src/lib/map-points.ts para a regra de visibilidade.

import { NextResponse } from "next/server"
import { getLocale } from "next-intl/server"
import { apiError } from "@/lib/api"
import { publicMapPoints } from "@/lib/map-points"

export async function GET() {
  try {
    const locale = await getLocale()
    const points = await publicMapPoints(locale)
    return NextResponse.json(points)
  } catch (err) {
    return apiError(err)
  }
}
