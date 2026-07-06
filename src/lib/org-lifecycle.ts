// MARES — Ciclo de vida de um grupo de pesquisa (Organization) em relação aos membros.
// Regra: um grupo que fica SEM membros é DESATIVADO (deactivatedAt = data), não excluído.
// Seus dados públicos continuam visíveis no mapa público (que filtra só por isPublic, sem
// olhar o status da org). Readicionar um membro reativa o grupo. Ver docs/CADASTRO_E_ACESSO.md.

import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"

type Db = PrismaClient | Prisma.TransactionClient

// Desativa o grupo se ele ficou sem nenhum membro. Retorna true se desativou.
export async function deactivateOrgIfEmpty(orgId: string, db: Db = prisma): Promise<boolean> {
  const remaining = await db.membership.count({ where: { orgId } })
  if (remaining > 0) return false
  await db.organization.update({
    where: { id: orgId },
    data: { deactivatedAt: new Date() },
  })
  return true
}

// Reativa o grupo ao readicionar um membro (no-op se já estiver ativo).
export async function reactivateOrg(orgId: string, db: Db = prisma): Promise<void> {
  await db.organization.updateMany({
    where: { id: orgId, deactivatedAt: { not: null } },
    data: { deactivatedAt: null },
  })
}
