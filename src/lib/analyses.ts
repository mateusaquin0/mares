// MARES — Selects compartilhados do domínio Análises.
// Rastreio (parentAnalysisId = null) e confirmação (parentAnalysisId preenchido) vêm na mesma
// lista plana das grades; o cliente separa e aninha. As confirmações trazem o próprio
// patógeno/exame (para exibir a espécie) e as sequências. Ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md.

import type { Prisma } from "@prisma/client"

// Uma linha da grade (rastreio ou confirmação) com o mínimo para exibir e aninhar.
export const analysisRowSelect = {
  id: true,
  sampleId: true,
  pathogenId: true,
  examTypeId: true,
  parentAnalysisId: true,
  result: true,
  measureValue: true,
  notes: true,
  pathogen: { select: { id: true, scientificName: true, name: true } },
  examType: { select: { id: true, name: true } },
  sequences: {
    select: {
      id: true,
      marker: true,
      accession: true,
      pctIdentity: true,
      consensus: true,
      platform: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.AnalysisSelect

// Patógeno do protocolo, com táxon para sugerir espécies da mesma família na confirmação.
export const protocolPathogenSelect = {
  id: true,
  scientificName: true,
  name: true,
  taxonFamily: true,
  taxonRank: true,
  taxonId: true,
} satisfies Prisma.PathogenSelect
