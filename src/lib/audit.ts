// MARES — Helper de auditoria (AuditLog). Registra alterações campo a campo de
// entidades científicas (Animal, Sample, Analysis) para a timeline do animal.
// O valor é sempre normalizado para string (ou null) — o modelo guarda old/newValue.

import { prisma } from "@/lib/prisma"

export type FieldChange = { field: string; oldValue: string | null; newValue: string | null }

// Normaliza qualquer valor para a forma gravada no log. Datas viram ISO (comparação estável),
// vazios viram null. Comparar sempre before/after do BANCO evita ruído de formato.
export function auditStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

// Diferença entre dois estados (ambos vindos do banco) nos campos informados.
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: readonly (keyof T & string)[],
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const f of fields) {
    const o = auditStr(before[f])
    const n = auditStr(after[f])
    if (o !== n) changes.push({ field: f, oldValue: o, newValue: n })
  }
  return changes
}

// Grava um lote de alterações (no-op se vazio). `entity`: "Animal" | "Sample" | "Analysis".
export async function writeAudit(
  entity: string,
  entityId: string,
  userId: string,
  changes: FieldChange[],
): Promise<void> {
  if (changes.length === 0) return
  await prisma.auditLog.createMany({
    data: changes.map((c) => ({ ...c, userId, entity, entityId })),
  })
}
