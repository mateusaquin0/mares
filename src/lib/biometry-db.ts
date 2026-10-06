// MARES — Biometria: acesso a banco (servidor). Os helpers puros ficam em lib/biometry.ts,
// que é client-safe; este módulo importa o Prisma e não pode entrar no bundle do cliente.

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { mergeLabels } from "@/lib/biometry"
import type { AnimalBiometry, BiometryMeasure } from "@/types/biometry"

// Teto das varreduras que alimentam o vocabulário do cadastro manual. O autocompletar não
// precisa do acervo inteiro: os rótulos de um formulário se repetem a cada registro, então
// algumas centenas já cobrem tudo que existe — e o limite impede que a consulta cresça com o
// acervo.
const VOCAB_SCAN_LIMIT = 300

/**
 * Converte o JSON do banco em `AnimalBiometry`, descartando o que não tiver forma.
 *
 * A coluna é JSONB livre: pode ter sido gravada por uma versão anterior do formato, ou vir de
 * um restore. Ler defensivamente evita quebrar a tela do indivíduo por causa de uma linha
 * malformada.
 */
export function toBiometry(value: Prisma.JsonValue | null | undefined): AnimalBiometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.measures)) return null

  const measures: BiometryMeasure[] = []
  for (const item of raw.measures) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const m = item as Record<string, unknown>
    if (typeof m.label !== "string" || !m.label.trim()) continue
    const v = m.value
    measures.push({
      label: m.label,
      value: typeof v === "number" && Number.isFinite(v) ? v : null,
    })
  }

  return {
    group: typeof raw.group === "string" && raw.group.trim() ? raw.group : null,
    unit: typeof raw.unit === "string" && raw.unit.trim() ? raw.unit : null,
    measures,
  }
}

/** Grupos (formulários) já usados na organização — alimenta o seletor da aba. */
export async function knownGroups(orgId: string): Promise<string[]> {
  const rows = await prisma.animal.findMany({
    where: { orgId, NOT: { measurements: { equals: Prisma.DbNull } } },
    select: { measurements: true },
    orderBy: { createdAt: "desc" },
    take: VOCAB_SCAN_LIMIT,
  })
  const seen = new Set<string>()
  for (const r of rows) {
    const g = toBiometry(r.measurements)?.group
    if (g) seen.add(g)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/**
 * Rótulos já vistos no grupo, na ordem do formulário — é o vocabulário do cadastro manual.
 *
 * Sem lista canônica em código, os campos que a aba oferece saem do que já está no banco: a
 * primeira importação de um grupo ensina o formulário inteiro (por isso as medidas vazias
 * também são guardadas). Grupo nulo → nada a sugerir, porque rótulos de formulários
 * diferentes não se misturam.
 */
export async function knownLabels(orgId: string, group: string | null): Promise<string[]> {
  if (!group) return []
  const rows = await prisma.animal.findMany({
    where: { orgId, measurements: { path: ["group"], equals: group } },
    select: { measurements: true },
    orderBy: { createdAt: "desc" },
    take: VOCAB_SCAN_LIMIT,
  })
  const blocks = rows
    .map((r) => toBiometry(r.measurements))
    .filter((b): b is AnimalBiometry => b !== null)
  return mergeLabels(blocks)
}
