// MARES — Biometria de um indivíduo (PMP > Biometria do SIMBA): leitura e gravação em bloco.
// Regras (docs/PERMISSOES.md §Animais): ver/editar = qualquer membro da org que enxerga o
// indivíduo. A biometria descreve a CARCAÇA, então é do indivíduo e não tem filtro por
// pesquisa — mesma decisão do laudo anatomopatológico. Ver docs/PLANO_BIOMETRIA.md.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { knownGroups, knownLabels, toBiometry } from "@/lib/biometry-db"
import { stripWeight } from "@/lib/biometry"
import { saveBiometrySchema } from "@/schemas/biometry.schema"
import { auditStr, writeAudit, type FieldChange } from "@/lib/audit"
import type { BiometryResponse } from "@/types/biometry"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const row = await prisma.animal.findUniqueOrThrow({
      where: { id },
      select: { measurements: true, necropsyWeightKg: true, simbaRecordNumber: true },
    })
    const biometry = toBiometry(row.measurements)
    const [groups, labels] = await Promise.all([
      knownGroups(animal.orgId),
      knownLabels(animal.orgId, biometry?.group ?? null),
    ])

    const body: BiometryResponse = {
      biometry,
      weightKg: row.necropsyWeightKg,
      knownGroups: groups,
      knownLabels: labels,
      canImport: Boolean(row.simbaRecordNumber?.trim()),
    }
    return NextResponse.json(body)
  } catch (err) {
    return apiError(err)
  }
}

/**
 * Salva o bloco inteiro.
 *
 * PUT em bloco, e não um endpoint por medida como faz o laudo: a aba é um formulário de ~24
 * campos, não uma tabela de linhas com diálogo próprio — gravar campo a campo geraria 24
 * requisições. O servidor faz o diff contra o estado atual para a auditoria e substitui o JSON.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const data = saveBiometrySchema.parse(await req.json().catch(() => null))
    // O peso sai da lista e vai para a coluna própria: o rótulo permanece (com valor nulo)
    // para preservar a posição dele no formulário. Ver lib/biometry.ts §stripWeight.
    const { measures, weightKg, hasWeightLabel } = stripWeight(data.measures)

    const before = await prisma.animal.findUniqueOrThrow({
      where: { id },
      select: { measurements: true, necropsyWeightKg: true, simbaRecordNumber: true },
    })
    const previous = toBiometry(before.measurements)

    const empty = measures.length === 0 && !data.group
    const updated = await prisma.animal.update({
      where: { id },
      data: {
        // Sem medidas e sem grupo, a coluna volta a NULL: "biometria não preenchida" é um
        // estado, não um objeto vazio.
        measurements: empty
          ? Prisma.DbNull
          : ({ group: data.group ?? null, unit: data.unit ?? null, measures } as Prisma.JsonObject),
        // Só mexe no peso se o bloco tem o rótulo dele: o campo também é editável no
        // formulário do indivíduo, e salvar a biometria de um formulário sem "Peso total"
        // não pode apagar o que foi digitado lá.
        ...(hasWeightLabel ? { necropsyWeightKg: weightKg } : {}),
      },
      select: { measurements: true, necropsyWeightKg: true },
    })

    // Uma linha de auditoria por medida alterada, com o RÓTULO como `field` — a mudança
    // aparece na timeline do indivíduo junto com as demais. `entityId` é o animalId (e não um
    // id de linha, que não existe): a consulta da timeline não precisa carregar nada antes.
    const changes: FieldChange[] = []
    const antes = new Map((previous?.measures ?? []).map((m) => [m.label, m.value]))
    const depois = new Map(measures.map((m) => [m.label, m.value]))
    for (const label of new Set([...antes.keys(), ...depois.keys()])) {
      const o = auditStr(antes.get(label) ?? null)
      const n = auditStr(depois.get(label) ?? null)
      if (o !== n) changes.push({ field: label, oldValue: o, newValue: n })
    }
    if (hasWeightLabel && auditStr(before.necropsyWeightKg) !== auditStr(weightKg)) {
      changes.push({
        field: "necropsyWeightKg",
        oldValue: auditStr(before.necropsyWeightKg),
        newValue: auditStr(weightKg),
      })
    }
    await writeAudit("Biometry", id, user.id, changes)

    const body: BiometryResponse = {
      biometry: toBiometry(updated.measurements),
      weightKg: updated.necropsyWeightKg,
      knownGroups: await knownGroups(animal.orgId),
      knownLabels: await knownLabels(animal.orgId, data.group ?? null),
      canImport: Boolean(before.simbaRecordNumber?.trim()),
    }
    return NextResponse.json(body)
  } catch (err) {
    return apiError(err)
  }
}
