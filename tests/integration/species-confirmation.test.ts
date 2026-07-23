import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { deleteProtocolCascade } from "@/lib/protocols"
import {
  createConfirmation,
  deleteConfirmation,
  loadConfirmation,
  loadPositiveParent,
  updateConfirmation,
} from "@/lib/confirmations"

// Confirmação de espécie por sequenciamento (docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md).
// Testa contra um Postgres real: a criação de análises-filhas SEM protocolo, a validação do pai
// positivo, a substituição de sequências e — o ponto crítico — a cascata que remove as
// confirmações quando o rastreio-pai é apagado (ON DELETE CASCADE na auto-relação).

let orgId: string
let researchId: string
let groupId: string
let organId: string
let screeningPathogenId: string // rastreio (família)
let speciesAId: string // espécie confirmada A
let speciesBId: string // espécie confirmada B
let npcrId: string // exame de rastreio
let seqId: string // exame de sequenciamento
let animalId: string

async function pathogen(key: string, family: string | null) {
  const p = await prisma.pathogen.create({
    data: { key, groupId, scientificName: key, taxonFamily: family },
    select: { id: true },
  })
  return p.id
}
async function examType(key: string) {
  const e = await prisma.examType.create({
    data: { key, name: { pt: key, en: key } },
    select: { id: true },
  })
  return e.id
}
async function sample(identification: string) {
  const s = await prisma.sample.create({
    data: { animalId, researchId, organId, orgId, identification, sampleType: "Tecido" },
    select: { id: true },
  })
  return s.id
}
// Análise de rastreio (parentAnalysisId null).
async function screening(sampleId: string, result: "POSITIVO" | "NEGATIVO") {
  const a = await prisma.analysis.create({
    data: { sampleId, pathogenId: screeningPathogenId, examTypeId: npcrId, result },
    select: { id: true },
  })
  return a.id
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({ data: { name: "Org confirm (test)" }, select: { id: true } })
  ).id
  researchId = (
    await prisma.research.create({ data: { name: "RC (test)", orgId }, select: { id: true } })
  ).id
  groupId = (
    await prisma.pathogenGroup.create({
      data: { key: "grp_test_confirm", name: { pt: "Grupo", en: "Group" } },
      select: { id: true },
    })
  ).id
  organId = (
    await prisma.organ.create({
      // Nome = key (não um nome real): há índice único case-insensitive em name->>'pt'.
      data: {
        key: "organ_test_confirm",
        name: { pt: "organ_test_confirm", en: "organ_test_confirm" },
      },
      select: { id: true },
    })
  ).id
  screeningPathogenId = await pathogen("sarcocystidae_test", "Sarcocystidae")
  speciesAId = await pathogen("toxoplasma_test", "Sarcocystidae")
  speciesBId = await pathogen("neospora_test", "Sarcocystidae")
  npcrId = await examType("npcr_test_confirm")
  seqId = await examType("sequenciamento_test")
  animalId = (
    await prisma.animal.create({
      data: { species: "Sotalia guianensis", researchId, orgId },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  // Limpeza resiliente: se o beforeAll falhar no meio, alguns ids ficam undefined — filtra para
  // não quebrar o deleteMany e para não vazar linhas de catálogo. Apagar os rastreios cascateia
  // as confirmações (ON DELETE CASCADE) e as sequências.
  const ids = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x)
  if (orgId) {
    await prisma.analysis.deleteMany({ where: { sample: { orgId } } })
    await prisma.researchProtocol.deleteMany({ where: { research: { orgId } } })
    await prisma.sample.deleteMany({ where: { orgId } })
    await prisma.animal.deleteMany({ where: { orgId } })
    await prisma.research.deleteMany({ where: { orgId } })
    await prisma.organization.deleteMany({ where: { id: orgId } })
  }
  await prisma.pathogen.deleteMany({
    where: { id: { in: ids([screeningPathogenId, speciesAId, speciesBId]) } },
  })
  await prisma.examType.deleteMany({ where: { id: { in: ids([npcrId, seqId]) } } })
  if (organId) await prisma.organ.deleteMany({ where: { id: organId } })
  if (groupId) await prisma.pathogenGroup.deleteMany({ where: { id: groupId } })
  await prisma.$disconnect()
})

describe("Criação de confirmação (createConfirmation)", () => {
  it("cria a análise-filha com espécie + sequências, sem exigir protocolo", async () => {
    const s = await sample("AM-CONF-1")
    const parentId = await screening(s, "POSITIVO")

    const parent = await loadPositiveParent(parentId)
    const child = await createConfirmation(parent, {
      pathogenId: speciesAId,
      examTypeId: seqId,
      result: "POSITIVO",
      notes: null,
      sequences: [
        {
          marker: "18S rRNA",
          accession: "ON123456",
          pctIdentity: 99.2,
          consensus: null,
          platform: "Sanger",
        },
      ],
    })

    expect(child.parentAnalysisId).toBe(parentId)
    expect(child.pathogenId).toBe(speciesAId)
    expect(child.sequences).toHaveLength(1)
    expect(child.sequences[0]!.accession).toBe("ON123456")

    // Não existe protocolo para (espécie A, sequenciamento) — a confirmação foi criada mesmo assim.
    const combo = await prisma.researchProtocol.findFirst({
      where: { researchId, organId, pathogenId: speciesAId, examTypeId: seqId },
      select: { id: true },
    })
    expect(combo).toBeNull()
  })
})

describe("Validação do pai (loadPositiveParent)", () => {
  it("rejeita confirmação sob um rastreio não-positivo", async () => {
    const s = await sample("AM-CONF-NEG")
    const parentId = await screening(s, "NEGATIVO")
    await expect(loadPositiveParent(parentId)).rejects.toMatchObject({
      code: "confirmationParentNotPositive",
    })
  })

  it("rejeita quando o id não é um rastreio (é uma confirmação)", async () => {
    const s = await sample("AM-CONF-CHILD")
    const parentId = await screening(s, "POSITIVO")
    const parent = await loadPositiveParent(parentId)
    const child = await createConfirmation(parent, {
      pathogenId: speciesAId,
      examTypeId: seqId,
      result: "POSITIVO",
      notes: null,
      sequences: [],
    })
    await expect(loadPositiveParent(child.id)).rejects.toMatchObject({ code: "analysisNotFound" })
  })
})

describe("Edição e exclusão", () => {
  it("updateConfirmation substitui o conjunto de sequências", async () => {
    const s = await sample("AM-CONF-UPD")
    const parentId = await screening(s, "POSITIVO")
    const parent = await loadPositiveParent(parentId)
    const child = await createConfirmation(parent, {
      pathogenId: speciesAId,
      examTypeId: seqId,
      result: "POSITIVO",
      notes: null,
      sequences: [
        { marker: "18S", accession: null, pctIdentity: null, consensus: null, platform: null },
      ],
    })

    const updated = await updateConfirmation(child.id, {
      pathogenId: speciesAId,
      examTypeId: seqId,
      result: "POSITIVO",
      notes: "revisado",
      sequences: [
        { marker: "cox1", accession: "ON999", pctIdentity: 98.1, consensus: null, platform: null },
        { marker: "ITS1", accession: null, pctIdentity: null, consensus: null, platform: null },
      ],
    })
    expect(updated.notes).toBe("revisado")
    expect(updated.sequences).toHaveLength(2)
    // A sequência antiga (18S) não sobreviveu à substituição.
    expect(updated.sequences.map((x) => x.marker).sort()).toEqual(["ITS1", "cox1"])
  })

  it("deleteConfirmation remove a confirmação e suas sequências", async () => {
    const s = await sample("AM-CONF-DEL")
    const parentId = await screening(s, "POSITIVO")
    const parent = await loadPositiveParent(parentId)
    const child = await createConfirmation(parent, {
      pathogenId: speciesAId,
      examTypeId: seqId,
      result: "POSITIVO",
      notes: null,
      sequences: [
        { marker: "18S", accession: null, pctIdentity: null, consensus: null, platform: null },
      ],
    })

    await deleteConfirmation(child.id)
    expect(await prisma.analysis.findUnique({ where: { id: child.id } })).toBeNull()
    expect(await prisma.sequenceRecord.count({ where: { analysisId: child.id } })).toBe(0)
    await expect(loadConfirmation(child.id)).rejects.toMatchObject({ code: "analysisNotFound" })
  })

  it("rejeita espécie duplicada na mesma amostra", async () => {
    const s = await sample("AM-CONF-DUP")
    const parentId = await screening(s, "POSITIVO")
    const parent = await loadPositiveParent(parentId)
    const body = {
      pathogenId: speciesBId,
      examTypeId: seqId,
      result: "POSITIVO" as const,
      notes: null,
      sequences: [],
    }
    await createConfirmation(parent, body)
    await expect(createConfirmation(parent, body)).rejects.toMatchObject({
      code: "confirmationDuplicate",
    })
  })
})

describe("Cascata na exclusão de protocolo (o ponto crítico)", () => {
  it("apagar o protocolo de rastreio remove o pai E suas confirmações", async () => {
    const rp = await prisma.researchProtocol.create({
      data: { researchId, organId, pathogenId: screeningPathogenId, examTypeId: npcrId },
      select: { id: true },
    })
    const s = await sample("AM-CONF-CASCADE")
    const parentId = await screening(s, "POSITIVO")
    const parent = await loadPositiveParent(parentId)
    const child = await createConfirmation(parent, {
      pathogenId: speciesAId,
      examTypeId: seqId,
      result: "POSITIVO",
      notes: null,
      sequences: [
        { marker: "18S", accession: "ONX", pctIdentity: 97, consensus: null, platform: null },
      ],
    })

    // Exclusão destrutiva do protocolo: mira o rastreio; a confirmação (outra combinação) cai
    // por ON DELETE CASCADE na auto-relação, senão ficaria órfã.
    await deleteProtocolCascade(rp.id, {
      researchId,
      organId,
      pathogenId: screeningPathogenId,
      examTypeId: npcrId,
    })

    expect(await prisma.analysis.findUnique({ where: { id: parentId } })).toBeNull()
    expect(await prisma.analysis.findUnique({ where: { id: child.id } })).toBeNull()
    expect(await prisma.sequenceRecord.count({ where: { analysisId: child.id } })).toBe(0)
  })
})
