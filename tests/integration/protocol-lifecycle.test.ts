import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { deleteProtocolCascade, addOrReactivateProtocols, setProtocolStatus } from "@/lib/protocols"

// Fase 2 — testes de integração contra um Postgres real (ver docs/ROADMAP_TESTES.md).
// Cobre o ciclo de vida de protocolos e análises (docs/PLANO_PROTOCOLO_ANALISES.md):
// exclusão destrutiva com escopo exato, desativação/reativação não destrutiva e a validação
// que exige protocolo ativo para novos lançamentos. Usa as funções reais de src/lib/protocols.

// Catálogos e entidades criados, para limpeza determinística.
let orgId: string
let r1: string // pesquisa alvo
let r2: string // outra pesquisa (isolamento)
let o1: string // órgão alvo
let o2: string // outro órgão (isolamento)
let p1: string // patógeno alvo
let p2: string // outro patógeno (isolamento)
let e1: string // exame alvo
let e2: string // outro exame (isolamento)
let groupId: string
let animalId: string

async function organ(key: string) {
  const o = await prisma.organ.create({
    data: { key, name: { pt: key, en: key } },
    select: { id: true },
  })
  return o.id
}
async function pathogen(key: string) {
  const p = await prisma.pathogen.create({
    data: { key, groupId, scientificName: key },
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
async function sample(researchId: string, organId: string, identification: string) {
  const s = await prisma.sample.create({
    data: {
      animalId,
      researchId,
      organId,
      orgId,
      identification,
      sampleType: "Tecido",
    },
    select: { id: true },
  })
  return s.id
}
async function analysis(sampleId: string, pathogenId: string, examTypeId: string) {
  const a = await prisma.analysis.create({
    data: { sampleId, pathogenId, examTypeId, result: "POSITIVO" },
    select: { id: true },
  })
  return a.id
}
async function protocol(
  researchId: string,
  organId: string,
  pathogenId: string,
  examTypeId: string,
) {
  const rp = await prisma.researchProtocol.create({
    data: { researchId, organId, pathogenId, examTypeId },
    select: { id: true },
  })
  return rp.id
}

// Predicado real da rota PUT /api/analyses: célula só é válida se o trio estiver ATIVO.
function comboAllowsAnalysis(
  researchId: string,
  organId: string,
  pathogenId: string,
  examTypeId: string,
) {
  return prisma.researchProtocol
    .findFirst({
      where: { researchId, organId, pathogenId, examTypeId, status: "ACTIVE" },
      select: { id: true },
    })
    .then((c) => c !== null)
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { name: "Org protocolo (test)" },
      select: { id: true },
    })
  ).id
  r1 = (await prisma.research.create({ data: { name: "R1 (test)", orgId }, select: { id: true } }))
    .id
  r2 = (await prisma.research.create({ data: { name: "R2 (test)", orgId }, select: { id: true } }))
    .id
  groupId = (
    await prisma.pathogenGroup.create({
      data: { key: "grp_test_protocol", name: { pt: "Grupo", en: "Group" } },
      select: { id: true },
    })
  ).id
  o1 = await organ("organ_test_p1")
  o2 = await organ("organ_test_p2")
  p1 = await pathogen("pathogen_test_p1")
  p2 = await pathogen("pathogen_test_p2")
  e1 = await examType("exam_test_p1")
  e2 = await examType("exam_test_p2")
  animalId = (
    await prisma.animal.create({
      data: { species: "Sotalia guianensis", researchId: r1, orgId },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  // Ordem segura de FK.
  await prisma.analysis.deleteMany({ where: { sample: { orgId } } })
  await prisma.researchProtocol.deleteMany({ where: { researchId: { in: [r1, r2] } } })
  await prisma.sample.deleteMany({ where: { orgId } })
  await prisma.animal.deleteMany({ where: { orgId } })
  await prisma.research.deleteMany({ where: { orgId } })
  await prisma.organization.deleteMany({ where: { id: orgId } })
  await prisma.pathogen.deleteMany({ where: { id: { in: [p1, p2] } } })
  await prisma.examType.deleteMany({ where: { id: { in: [e1, e2] } } })
  await prisma.organ.deleteMany({ where: { id: { in: [o1, o2] } } })
  await prisma.pathogenGroup.deleteMany({ where: { id: groupId } })
  await prisma.$disconnect()
})

describe("Exclusão destrutiva de protocolo (deleteProtocolCascade)", () => {
  it("remove a entrada e as análises da combinação exata, preservando as demais", async () => {
    const rp = await protocol(r1, o1, p1, e1)

    // Amostras: mesma combinação, e variações por órgão/pesquisa.
    const sTarget = await sample(r1, o1, "AM-DEL-1")
    const sOtherOrgan = await sample(r1, o2, "AM-DEL-2")
    const sOtherResearch = await sample(r2, o1, "AM-DEL-3")

    const aTarget = await analysis(sTarget, p1, e1) // deve sumir
    const aSamePlaceOtherCombo = await analysis(sTarget, p2, e2) // outro patógeno+exame → fica
    const aOtherOrgan = await analysis(sOtherOrgan, p1, e1) // outro órgão → fica
    const aOtherResearch = await analysis(sOtherResearch, p1, e1) // outra pesquisa → fica

    const res = await deleteProtocolCascade(rp, {
      researchId: r1,
      organId: o1,
      pathogenId: p1,
      examTypeId: e1,
    })
    expect(res.deletedAnalyses).toBe(1)

    // Entrada de protocolo removida.
    expect(await prisma.researchProtocol.findUnique({ where: { id: rp } })).toBeNull()
    // Análise da combinação exata removida.
    expect(await prisma.analysis.findUnique({ where: { id: aTarget } })).toBeNull()
    // Vizinhas preservadas.
    for (const id of [aSamePlaceOtherCombo, aOtherOrgan, aOtherResearch]) {
      expect(await prisma.analysis.findUnique({ where: { id } })).not.toBeNull()
    }
  })
})

describe("Desativação / reativação (setProtocolStatus)", () => {
  it("desativar preserva análises e bloqueia novos lançamentos; reativar libera", async () => {
    const rp = await protocol(r1, o2, p2, e2)
    const s = await sample(r1, o2, "AM-INA-1")
    const a = await analysis(s, p2, e2)

    // Antes: combinação ativa aceita lançamento.
    expect(await comboAllowsAnalysis(r1, o2, p2, e2)).toBe(true)

    // Desativa.
    const off = await setProtocolStatus(rp, "INACTIVE")
    expect(off.status).toBe("INACTIVE")
    expect(off.deactivatedAt).not.toBeNull()
    // Análise histórica intacta.
    expect(await prisma.analysis.findUnique({ where: { id: a } })).not.toBeNull()
    // Novos lançamentos bloqueados.
    expect(await comboAllowsAnalysis(r1, o2, p2, e2)).toBe(false)

    // Reativa.
    const on = await setProtocolStatus(rp, "ACTIVE")
    expect(on.status).toBe("ACTIVE")
    expect(on.deactivatedAt).toBeNull()
    expect(await comboAllowsAnalysis(r1, o2, p2, e2)).toBe(true)
  })
})

describe("Adicionar protocolo (addOrReactivateProtocols)", () => {
  it("cria combinação inédita, reativa a inativa e ignora a já ativa", async () => {
    // Combinação existente e inativa: deve ser reativada, não duplicada.
    const existing = await protocol(r2, o1, p2, e2)
    await setProtocolStatus(existing, "INACTIVE")

    const { affected } = await addOrReactivateProtocols(r2, [
      { organId: o1, pathogenId: p2, examTypeId: e2 }, // reativa a existente
      { organId: o2, pathogenId: p1, examTypeId: e1 }, // inédita → cria
    ])
    expect(affected).toBe(2)

    // Não duplicou: a entrada existente foi reativada in place.
    const rows = await prisma.researchProtocol.findMany({
      where: { researchId: r2, organId: o1, pathogenId: p2, examTypeId: e2 },
      select: { id: true, status: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(existing)
    expect(rows[0].status).toBe("ACTIVE")

    // Reenviar uma combinação já ativa não conta como afetada.
    const again = await addOrReactivateProtocols(r2, [
      { organId: o2, pathogenId: p1, examTypeId: e1 },
    ])
    expect(again.affected).toBe(0)
  })
})
