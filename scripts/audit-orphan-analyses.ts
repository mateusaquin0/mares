// MARES — Auditoria de análises órfãs (ver docs/PLANO_PROTOCOLO_ANALISES.md).
//
// SOMENTE LEITURA: conta e exporta as análises que não possuem entrada de protocolo
// correspondente (combinação sample.researchId + sample.organId + analysis.pathogenId +
// analysis.examTypeId sem ResearchProtocol). Rode ANTES de aplicar a migration
// 20260711000000_protocol_lifecycle, cujo DELETE remove esses registros de forma irreversível.
//
// Uso:
//   npx tsx scripts/audit-orphan-analyses.ts            # conta + exporta CSV completo
//   npx tsx scripts/audit-orphan-analyses.ts --count    # apenas a contagem
//
// O CSV é gravado ao lado do script, com timestamp no nome.

import { PrismaClient } from "@prisma/client"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

const prisma = new PrismaClient({ log: ["error"] })

type OrphanRow = {
  analysisId: string
  sampleId: string
  researchId: string
  organId: string
  pathogenId: string
  examTypeId: string
  result: string | null
  measureValue: number | null
  notes: string | null
}

// Escapa um campo para CSV (aspas duplas, quebras de linha e vírgulas).
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const countOnly = process.argv.includes("--count")

  const [row] = await prisma.$queryRaw<{ orphan_analyses: bigint }[]>`
    SELECT COUNT(*) AS orphan_analyses
    FROM "Analysis" a
    JOIN "Sample" s ON s.id = a."sampleId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "ResearchProtocol" rp
      WHERE rp."researchId" = s."researchId"
        AND rp."organId" = s."organId"
        AND rp."pathogenId" = a."pathogenId"
        AND rp."examTypeId" = a."examTypeId"
    )
  `

  const total = Number(row?.orphan_analyses ?? 0)
  console.log(`Análises órfãs encontradas: ${total}`)

  if (countOnly || total === 0) {
    if (total === 0) console.log("Nada a exportar — o banco já está saneado.")
    return
  }

  const rows = await prisma.$queryRaw<OrphanRow[]>`
    SELECT
      a.id AS "analysisId",
      s.id AS "sampleId",
      s."researchId",
      s."organId",
      a."pathogenId",
      a."examTypeId",
      a.result::text AS result,
      a."ctValue" AS "measureValue",
      a.notes
    FROM "Analysis" a
    JOIN "Sample" s ON s.id = a."sampleId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "ResearchProtocol" rp
      WHERE rp."researchId" = s."researchId"
        AND rp."organId" = s."organId"
        AND rp."pathogenId" = a."pathogenId"
        AND rp."examTypeId" = a."examTypeId"
    )
    ORDER BY s."researchId", s."organId", a."pathogenId", a."examTypeId"
  `

  const header = [
    "analysisId",
    "sampleId",
    "researchId",
    "organId",
    "pathogenId",
    "examTypeId",
    "result",
    "measureValue",
    "notes",
  ]
  const csv = [
    header.join(","),
    ...rows.map((r) => header.map((h) => csvCell(r[h as keyof OrphanRow])).join(",")),
  ].join("\n")

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outPath = join(__dirname, `orphan-analyses-${stamp}.csv`)
  writeFileSync(outPath, csv, "utf8")
  console.log(`Exportadas ${rows.length} linhas para: ${outPath}`)
}

main()
  .catch((err) => {
    console.error("Falha na auditoria:", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
