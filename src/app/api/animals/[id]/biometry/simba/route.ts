// MARES — Prévia da biometria vinda do SIMBA. NÃO grava: devolve o bloco para a tela mostrar
// a conferência (o que veio, o que diverge do que está salvo) antes de o usuário confirmar.
// São ~24 valores — grandes demais para o pré-preenchimento silencioso que o formulário do
// indivíduo faz com os campos de encalhe. Ver docs/PLANO_BIOMETRIA.md.

import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { fetchSimbaRecord } from "@/lib/simba"
import { stripWeight } from "@/lib/biometry"
import { ValidationError } from "@/lib/errors"
import type { BiometryPreview } from "@/types/biometry"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const row = await prisma.animal.findUniqueOrThrow({
      where: { id },
      select: { simbaRecordNumber: true },
    })
    const record = row.simbaRecordNumber?.trim()
    // Sem número de registro não há o que buscar. A tela desabilita o botão, mas o servidor
    // não pode confiar nisso.
    if (!record) throw new ValidationError("Informe o número de registro do SIMBA")

    const simba = await fetchSimbaRecord(record)

    // Biometria nula com medidas no XML = pareamento recusado (rótulos e valores em
    // quantidades divergentes, fora do defeito conhecido). A tela precisa distinguir isso de
    // "o registro não tem biometria", então o motivo viaja em `mismatch`.
    if (!simba.biometry) {
      const body: BiometryPreview = {
        biometry: null,
        weightKg: null,
        mismatch: simba.measurementCounts,
      }
      return NextResponse.json(body)
    }

    const { measures, weightKg } = stripWeight(simba.biometry.measures)
    const body: BiometryPreview = {
      biometry: { group: simba.biometry.group, unit: simba.biometry.unit, measures },
      weightKg,
      mismatch: null,
    }
    return NextResponse.json(body)
  } catch (err) {
    return apiError(err)
  }
}
