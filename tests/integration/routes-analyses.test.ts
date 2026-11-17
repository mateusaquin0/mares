import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ctx, json, login, req } from "./helpers/route"
import {
  DENIED,
  auditOf,
  deniedStatuses,
  destroyWorld,
  makeAnimal,
  makeSample,
  makeScreening,
  makeShare,
  newWorld,
  seedWorld,
} from "./helpers/animals-world"

// Rotas de ANÁLISE, chamadas pelos handlers reais contra o banco de testes:
//   PUT        /api/analyses                           (célula da grade = rastreio)
//   POST       /api/analyses/[parentId]/confirmations  (confirmação de espécie)
//   PUT/DELETE /api/analyses/confirmations/[childId]
//
// O que protegem: só se lança resultado em combinação ATIVA do protocolo da pesquisa dona da
// amostra; o corpo é um patch (campo ausente não é tocado) e célula esvaziada é removida;
// toda mudança de valor vai para a auditoria com autor; confirmação de espécie só existe sob
// rastreio POSITIVO e não se repete na amostra; e em tudo vale o escopo por pesquisa.

import { PUT as putAnalysis } from "@/app/api/analyses/route"
import { POST as createConfirmation } from "@/app/api/analyses/[parentId]/confirmations/route"
import {
  PUT as updateConfirmation,
  DELETE as deleteConfirmation,
} from "@/app/api/analyses/confirmations/[childId]/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RAN")

let solo: string // indivíduo só da pesquisa P
let shared: string // primária P, compartilhado (aceito) com Q

type CellBody = {
  status: "saved" | "unchanged" | "cleared"
  analysis: {
    id: string
    result: string | null
    measureValue: number | null
    notes: string | null
  } | null
}
type ConfirmationBody = {
  id: string
  sampleId: string
  parentAnalysisId: string | null
  result: string | null
  notes: string | null
  pathogen: { id: string }
  examType: { id: string }
  sequences: { marker: string | null; accession: string | null; pctIdentity: number | null }[]
}
type ErrorBody = { code: string }

const cell = (
  sampleId: string,
  patch: Record<string, unknown>,
  over: Record<string, string> = {},
) =>
  putAnalysis(
    req("/api/analyses", {
      method: "PUT",
      body: { sampleId, pathogenId: w.pathogenId, examTypeId: w.examId, ...over, ...patch },
    }),
  )
const screeningOf = (sampleId: string) =>
  prisma.analysis.findFirst({
    where: { sampleId, pathogenId: w.pathogenId, examTypeId: w.examId, parentAnalysisId: null },
  })

const confirm = (parentId: string, body: unknown) =>
  createConfirmation(req(`/api/analyses/${parentId}/confirmations`, { body }), ctx({ parentId }))
const editConfirmation = (childId: string, body: unknown) =>
  updateConfirmation(
    req(`/api/analyses/confirmations/${childId}`, { method: "PUT", body }),
    ctx({ childId }),
  )
const dropConfirmation = (childId: string) =>
  deleteConfirmation(
    req(`/api/analyses/confirmations/${childId}`, { method: "DELETE" }),
    ctx({ childId }),
  )

const species = (over: Record<string, unknown> = {}) => ({
  pathogenId: w.speciesId,
  examTypeId: w.seqExamId,
  ...over,
})

/** Amostra de P no indivíduo `solo` com um rastreio já lançado. */
async function sampleWithScreening(result: "POSITIVO" | "NEGATIVO", animalId = solo) {
  const sample = await makeSample(w, animalId, w.researchP)
  const parentId = await makeScreening(w, sample.id, result)
  return { sampleId: sample.id, parentId }
}

/** Confirmação gravada direto no banco (sem passar pela rota). */
async function makeConfirmation(sampleId: string, parentId: string, pathogenId = w.speciesId) {
  const child = await prisma.analysis.create({
    data: {
      sampleId,
      parentAnalysisId: parentId,
      pathogenId,
      examTypeId: w.seqExamId,
      result: "POSITIVO",
      sequences: { create: [{ marker: "18S rRNA", accession: "AB000001" }] },
    },
    select: { id: true },
  })
  return child.id
}

beforeAll(async () => {
  await seedWorld(w)
  solo = (await makeAnimal(w, w.researchP)).id
  shared = (await makeAnimal(w, w.researchP)).id
  await makeShare(shared, w.researchQ)
})

afterAll(async () => {
  await destroyWorld(w)
})

describe("PUT /api/analyses — lançamento na célula da grade", () => {
  it("cria o rastreio e audita cada campo lançado, com o autor", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    const res = await cell(sample.id, { result: "POSITIVO", measureValue: 31.5, notes: "banda" })
    expect(res.status).toBe(200)
    const body = await json<CellBody>(res)
    expect(body.status).toBe("saved")
    expect(body.analysis).toMatchObject({ result: "POSITIVO", measureValue: 31.5, notes: "banda" })

    const row = await screeningOf(sample.id)
    expect(row).toMatchObject({
      id: body.analysis!.id,
      result: "POSITIVO",
      measureValue: 31.5,
      notes: "banda",
      parentAnalysisId: null,
    })

    const log = await auditOf("Analysis", row!.id)
    expect(log.every((l) => l.userId === w.users.resP)).toBe(true)
    expect(Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))).toEqual({
      result: [null, "POSITIVO"],
      measureValue: [null, "31.5"],
      notes: [null, "banda"],
    })
  })

  it("é um patch: campo ausente fica como está, e só o que mudou é auditado", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    await cell(sample.id, { result: "NEGATIVO", notes: "primeira leitura" })
    const id = (await screeningOf(sample.id))!.id

    login(w.as.resP2)
    const res = await cell(sample.id, { measureValue: 12 })
    expect((await json<CellBody>(res)).status).toBe("saved")
    expect(await screeningOf(sample.id)).toMatchObject({
      id,
      result: "NEGATIVO",
      notes: "primeira leitura",
      measureValue: 12,
    })

    const log = await auditOf("Analysis", id)
    expect(log.at(-1)).toEqual({
      field: "measureValue",
      oldValue: null,
      newValue: "12",
      userId: w.users.resP2,
    })
    expect(log).toHaveLength(3)
  })

  it("relançar o mesmo valor responde 'unchanged' e não grava nem audita", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    await cell(sample.id, { result: "INCONCLUSIVO" })
    const id = (await screeningOf(sample.id))!.id

    const res = await cell(sample.id, { result: "INCONCLUSIVO" })
    const body = await json<CellBody>(res)
    expect(body.status).toBe("unchanged")
    expect(body.analysis?.id).toBe(id)
    expect(await auditOf("Analysis", id)).toHaveLength(1)
    expect(await prisma.analysis.count({ where: { sampleId: sample.id } })).toBe(1)
  })

  it("esvaziar a célula remove o lançamento (e as confirmações) e audita a saída", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP)
    const res = await cell(sampleId, { result: null, measureValue: null, notes: null })
    expect(res.status).toBe(200)
    expect(await json<CellBody>(res)).toEqual({ status: "cleared", analysis: null })

    expect(await prisma.analysis.count({ where: { id: { in: [parentId, childId] } } })).toBe(0)
    expect(await prisma.sequenceRecord.count({ where: { analysisId: childId } })).toBe(0)
    expect(await auditOf("Analysis", parentId)).toEqual([
      { field: "result", oldValue: "POSITIVO", newValue: null, userId: w.users.resP },
    ])
  })

  it("limpar uma célula que nunca teve lançamento não cria linha", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    const res = await cell(sample.id, { result: null })
    expect(await json<CellBody>(res)).toEqual({ status: "unchanged", analysis: null })
    expect(await prisma.analysis.count({ where: { sampleId: sample.id } })).toBe(0)
  })

  it("o lançamento atinge o rastreio, nunca a confirmação que repete patógeno e exame", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const twin = await prisma.analysis.create({
      data: {
        sampleId,
        parentAnalysisId: parentId,
        pathogenId: w.pathogenId,
        examTypeId: w.examId,
        result: "POSITIVO",
      },
      select: { id: true },
    })
    login(w.as.resP)
    const res = await cell(sampleId, { result: "INCONCLUSIVO" })
    expect((await json<CellBody>(res)).analysis?.id).toBe(parentId)
    const rows = await prisma.analysis.findMany({
      where: { id: { in: [parentId, twin.id] } },
      select: { id: true, result: true },
    })
    expect(Object.fromEntries(rows.map((r) => [r.id, r.result]))).toEqual({
      [parentId]: "INCONCLUSIVO",
      [twin.id]: "POSITIVO",
    })
  })

  it("recusa combinação fora do protocolo da pesquisa (422)", async () => {
    login(w.as.resP)
    const inProtocol = await makeSample(w, solo, w.researchP)
    const otherPathogen = await cell(
      inProtocol.id,
      { result: "POSITIVO" },
      { pathogenId: w.speciesId },
    )
    expect(otherPathogen.status).toBe(422)
    expect((await json<ErrorBody>(otherPathogen)).code).toBe("analysisInvalidCombo")

    const otherExam = await cell(inProtocol.id, { result: "POSITIVO" }, { examTypeId: w.seqExamId })
    expect(otherExam.status).toBe(422)

    const otherOrgan = await makeSample(w, solo, w.researchP, { organId: w.organ2Id })
    const organ = await cell(otherOrgan.id, { result: "POSITIVO" })
    expect(organ.status).toBe(422)
    expect((await json<ErrorBody>(organ)).code).toBe("analysisInvalidCombo")

    expect(
      await prisma.analysis.count({ where: { sampleId: { in: [inProtocol.id, otherOrgan.id] } } }),
    ).toBe(0)
  })

  it("combinação INATIVA preserva o histórico mas não aceita novo lançamento (422)", async () => {
    await prisma.researchProtocol.create({
      data: {
        researchId: w.researchP,
        organId: w.organ2Id,
        pathogenId: w.pathogenId,
        examTypeId: w.examId,
        status: "INACTIVE",
        deactivatedAt: new Date(),
      },
    })
    const sample = await makeSample(w, solo, w.researchP, { organId: w.organ2Id })
    const historic = await makeScreening(w, sample.id, "POSITIVO")
    login(w.as.adminA)
    const res = await cell(sample.id, { result: "NEGATIVO" })
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("analysisInvalidCombo")
    const row = await prisma.analysis.findUniqueOrThrow({ where: { id: historic } })
    expect(row.result).toBe("POSITIVO")
    await prisma.researchProtocol.deleteMany({
      where: { researchId: w.researchP, organId: w.organ2Id },
    })
  })

  it("valida o corpo (422) e a amostra (404)", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    for (const patch of [
      { result: "TALVEZ" },
      { measureValue: "31,5" },
      { notes: "x".repeat(501) },
    ]) {
      const res = await cell(sample.id, patch)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    const noSample = await putAnalysis(
      req("/api/analyses", {
        method: "PUT",
        body: { pathogenId: w.pathogenId, result: "POSITIVO" },
      }),
    )
    expect(noSample.status).toBe(422)
    expect(await prisma.analysis.count({ where: { sampleId: sample.id } })).toBe(0)

    const missing = await cell(randomUUID(), { result: "POSITIVO" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("sampleNotFound")
  })

  it("no indivíduo compartilhado, cada pesquisador lança só nas amostras da sua pesquisa", async () => {
    const ofP = await makeSample(w, shared, w.researchP)
    const ofQ = await makeSample(w, shared, w.researchQ)
    login(w.as.resQ)
    expect((await cell(ofP.id, { result: "POSITIVO" })).status).toBe(403)
    expect(await screeningOf(ofP.id)).toBeNull()

    const own = await cell(ofQ.id, { result: "POSITIVO" })
    expect(own.status).toBe(200)
    expect((await screeningOf(ofQ.id))?.result).toBe("POSITIVO")
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    expect(await deniedStatuses(w, () => cell(sample.id, { result: "POSITIVO" }))).toEqual(DENIED)
    expect(await screeningOf(sample.id)).toBeNull()
  })
})

describe("POST /api/analyses/[parentId]/confirmations", () => {
  it("cria a confirmação sob o rastreio positivo, com as sequências", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.resP)
    const res = await confirm(
      parentId,
      species({
        notes: "  BLAST 99%  ",
        sequences: [
          { marker: "18S rRNA", accession: "MK123456", pctIdentity: 99.2, platform: "Sanger" },
          { marker: "ITS1" },
        ],
      }),
    )
    expect(res.status).toBe(201)
    const body = await json<ConfirmationBody>(res)
    expect(body).toMatchObject({
      sampleId,
      parentAnalysisId: parentId,
      result: "POSITIVO", // padrão quando o corpo não informa
      notes: "BLAST 99%",
      pathogen: { id: w.speciesId },
      examType: { id: w.seqExamId },
    })
    expect(body.sequences.map((s) => s.marker)).toEqual(["18S rRNA", "ITS1"])

    const row = await prisma.analysis.findUniqueOrThrow({
      where: { id: body.id },
      include: { sequences: { orderBy: { createdAt: "asc" } } },
    })
    expect(row).toMatchObject({ sampleId, parentAnalysisId: parentId, pathogenId: w.speciesId })
    expect(row.sequences).toHaveLength(2)
    expect(row.sequences[0]).toMatchObject({
      marker: "18S rRNA",
      accession: "MK123456",
      pctIdentity: 99.2,
      platform: "Sanger",
    })
  })

  it("aceita resultado inconclusivo e nenhuma sequência", async () => {
    const { parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.adminA)
    const res = await confirm(parentId, species({ result: "INCONCLUSIVO" }))
    expect(res.status).toBe(201)
    const body = await json<ConfirmationBody>(res)
    expect(body.result).toBe("INCONCLUSIVO")
    expect(body.sequences).toEqual([])
  })

  it("só rastreio POSITIVO recebe confirmação (422)", async () => {
    const { sampleId, parentId } = await sampleWithScreening("NEGATIVO")
    login(w.as.resP)
    const res = await confirm(parentId, species())
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("confirmationParentNotPositive")
    expect(await prisma.analysis.count({ where: { sampleId } })).toBe(1)
  })

  it("o pai tem de ser um rastreio existente: confirmação ou id desconhecido dão 404", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP)
    for (const id of [childId, randomUUID()]) {
      const res = await confirm(id, species({ pathogenId: w.species2Id }))
      expect(res.status).toBe(404)
      expect((await json<ErrorBody>(res)).code).toBe("analysisNotFound")
    }
    expect(await prisma.analysis.count({ where: { sampleId } })).toBe(2)
  })

  it("a mesma espécie com o mesmo exame não se repete na amostra (409)", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.resP)
    expect((await confirm(parentId, species())).status).toBe(201)
    const again = await confirm(parentId, species())
    expect(again.status).toBe(409)
    expect((await json<ErrorBody>(again)).code).toBe("confirmationDuplicate")
    // Outra espécie na mesma amostra continua permitida.
    expect((await confirm(parentId, species({ pathogenId: w.species2Id }))).status).toBe(201)
    expect(await prisma.analysis.count({ where: { sampleId, parentAnalysisId: parentId } })).toBe(2)
  })

  it("valida o corpo (422)", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.resP)
    const invalid = [
      { examTypeId: w.seqExamId },
      species({ result: "TALVEZ" }),
      species({ sequences: [{ pctIdentity: "99%" }] }),
      species({ sequences: Array.from({ length: 21 }, () => ({ marker: "18S" })) }),
    ]
    for (const body of invalid) {
      const res = await confirm(parentId, body)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    expect(await prisma.analysis.count({ where: { sampleId } })).toBe(1)
  })

  it("pesquisador de outra pesquisa do indivíduo compartilhado não confirma em amostra alheia", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO", shared)
    login(w.as.resQ)
    expect((await confirm(parentId, species())).status).toBe(403)
    expect(await prisma.analysis.count({ where: { sampleId } })).toBe(1)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    expect(await deniedStatuses(w, () => confirm(parentId, species()))).toEqual(DENIED)
    expect(await prisma.analysis.count({ where: { sampleId } })).toBe(1)
  })

  // BUG (baixa severidade): a validação do pai roda ANTES da checagem de acesso, então quem não
  // alcança a amostra recebe 422 em vez de 403 — e fica sabendo que aquele rastreio alheio
  // existe e não é positivo. A recusa por permissão deveria vir primeiro.
  it.fails("quem não alcança a amostra recebe 403 mesmo se o rastreio não é positivo", async () => {
    const { parentId } = await sampleWithScreening("NEGATIVO")
    login(w.as.adminB)
    expect((await confirm(parentId, species())).status).toBe(403)
  })

  // BUG: espécie ou exame inexistentes não são conferidos antes de gravar; a violação de chave
  // estrangeira sobe como erro interno (500). Deveria responder 404/422 como as demais rotas.
  it.fails("espécie inexistente no glossário é recusada sem erro interno", async () => {
    const { parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.resP)
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const res = await confirm(parentId, species({ pathogenId: randomUUID() }))
      expect([404, 422]).toContain(res.status)
    } finally {
      errors.mockRestore()
    }
  })

  // BUG: o lançamento do rastreio é auditado campo a campo, mas a confirmação de espécie —
  // que é o dado que resolve QUAL patógeno — nasce sem nenhuma linha de AuditLog.
  it.fails("a criação da confirmação é registrada na auditoria", async () => {
    const { parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.resP)
    const res = await confirm(parentId, species())
    expect(res.status).toBe(201)
    const { id } = await json<ConfirmationBody>(res)
    expect((await auditOf("Analysis", id)).length).toBeGreaterThan(0)
  })
})

describe("PUT /api/analyses/confirmations/[childId]", () => {
  it("troca espécie, resultado e observação e SUBSTITUI o conjunto de sequências", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP2)
    const res = await editConfirmation(
      childId,
      species({
        pathogenId: w.species2Id,
        result: "INCONCLUSIVO",
        notes: "releitura",
        sequences: [{ marker: "cox1", accession: "ZZ999999", pctIdentity: 97 }],
      }),
    )
    expect(res.status).toBe(200)
    const body = await json<ConfirmationBody>(res)
    expect(body).toMatchObject({
      id: childId,
      result: "INCONCLUSIVO",
      notes: "releitura",
      pathogen: { id: w.species2Id },
    })
    expect(body.sequences).toHaveLength(1)

    const row = await prisma.analysis.findUniqueOrThrow({
      where: { id: childId },
      include: { sequences: true },
    })
    expect(row).toMatchObject({
      pathogenId: w.species2Id,
      result: "INCONCLUSIVO",
      notes: "releitura",
      parentAnalysisId: parentId,
    })
    expect(row.sequences.map((s) => [s.marker, s.accession])).toEqual([["cox1", "ZZ999999"]])
  })

  it("recusa virar duplicata de outra confirmação da amostra (409) e nada muda", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    await makeConfirmation(sampleId, parentId, w.speciesId)
    const other = await makeConfirmation(sampleId, parentId, w.species2Id)
    login(w.as.resP)
    const res = await editConfirmation(other, species({ sequences: [] }))
    expect(res.status).toBe(409)
    expect((await json<ErrorBody>(res)).code).toBe("confirmationDuplicate")
    const row = await prisma.analysis.findUniqueOrThrow({
      where: { id: other },
      include: { sequences: true },
    })
    expect(row.pathogenId).toBe(w.species2Id)
    // A transação desfaz também a troca das sequências.
    expect(row.sequences).toHaveLength(1)
  })

  it("só edita confirmação: rastreio ou id desconhecido dão 404; corpo inválido, 422", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP)
    for (const id of [parentId, randomUUID()]) {
      const res = await editConfirmation(id, species())
      expect(res.status).toBe(404)
      expect((await json<ErrorBody>(res)).code).toBe("analysisNotFound")
    }
    expect((await editConfirmation(childId, { pathogenId: w.speciesId })).status).toBe(422)
    const parent = await prisma.analysis.findUniqueOrThrow({ where: { id: parentId } })
    expect(parent).toMatchObject({ pathogenId: w.pathogenId, result: "POSITIVO" })
  })

  it("barra sem sessão, outra organização, sem vínculo e a pesquisa vizinha do compartilhado", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO", shared)
    const childId = await makeConfirmation(sampleId, parentId)
    const attempt = () => editConfirmation(childId, species({ pathogenId: w.species2Id }))
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    login(w.as.resQ)
    expect((await attempt()).status).toBe(403)
    const row = await prisma.analysis.findUniqueOrThrow({ where: { id: childId } })
    expect(row.pathogenId).toBe(w.speciesId)
  })

  // BUG: ver a criação — trocar a espécie confirmada não deixa rastro de quem trocou nem do
  // valor anterior.
  it.fails("a edição da confirmação é registrada na auditoria", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP)
    const res = await editConfirmation(childId, species({ pathogenId: w.species2Id }))
    expect(res.status).toBe(200)
    expect((await auditOf("Analysis", childId)).length).toBeGreaterThan(0)
  })
})

describe("DELETE /api/analyses/confirmations/[childId]", () => {
  it("remove a confirmação e as sequências, preservando o rastreio", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP)
    expect((await dropConfirmation(childId)).status).toBe(204)
    expect(await prisma.analysis.count({ where: { id: childId } })).toBe(0)
    expect(await prisma.sequenceRecord.count({ where: { analysisId: childId } })).toBe(0)
    expect(await prisma.analysis.count({ where: { id: parentId } })).toBe(1)
  })

  it("não apaga rastreio por esta porta (404) nem id desconhecido", async () => {
    const { parentId } = await sampleWithScreening("POSITIVO")
    login(w.as.adminA)
    expect((await dropConfirmation(parentId)).status).toBe(404)
    expect((await dropConfirmation(randomUUID())).status).toBe(404)
    expect(await prisma.analysis.count({ where: { id: parentId } })).toBe(1)
  })

  it("barra sem sessão, outra organização, sem vínculo e a pesquisa vizinha do compartilhado", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO", shared)
    const childId = await makeConfirmation(sampleId, parentId)
    expect(await deniedStatuses(w, () => dropConfirmation(childId))).toEqual(DENIED)
    login(w.as.resQ)
    expect((await dropConfirmation(childId)).status).toBe(403)
    expect(await prisma.analysis.count({ where: { id: childId } })).toBe(1)
  })

  // BUG: ver a criação — a exclusão da confirmação também não é auditada.
  it.fails("a exclusão da confirmação é registrada na auditoria", async () => {
    const { sampleId, parentId } = await sampleWithScreening("POSITIVO")
    const childId = await makeConfirmation(sampleId, parentId)
    login(w.as.resP)
    expect((await dropConfirmation(childId)).status).toBe(204)
    expect((await auditOf("Analysis", childId)).length).toBeGreaterThan(0)
  })
})
