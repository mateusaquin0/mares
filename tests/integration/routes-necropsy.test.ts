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
  makeShare,
  newWorld,
  seedWorld,
} from "./helpers/animals-world"

// Laudo anatomopatológico (macro por sistema, triagem da carcaça e histopatológico), pelos
// handlers reais contra o banco de testes:
//   GET          /api/animals/[id]/necropsy
//   PUT          /api/animals/[id]/necropsy/systems      (pronunciamento por sistema)
//   DELETE       /api/necropsy-systems/exams/[id]        (tira o sistema do laudo)
//   POST         /api/animals/[id]/necropsy/findings     (achado macroscópico)
//   PATCH/DELETE /api/necropsy-findings/[id]
//   PUT          /api/animals/[id]/necropsy/screening    (triagem da carcaça)
//   POST         /api/animals/[id]/histopathology
//   PATCH/DELETE /api/histopathology/[id]
//
// O que protegem: o laudo é do INDIVÍDUO — quem o enxerga (inclusive a pesquisa com que foi
// compartilhado) lê e edita, e ninguém mais; trocar o estado de um sistema ou tirá-lo do laudo
// nunca apaga achados em silêncio; o laudo não se contradiz (motivo só em "não examinado",
// quantidade de parasitas só se coletados, interações só com indício); e toda alteração vai
// para a auditoria com autor e valores.

import { GET as getNecropsy } from "@/app/api/animals/[id]/necropsy/route"
import { PUT as putSystem } from "@/app/api/animals/[id]/necropsy/systems/route"
import { DELETE as deleteSystemExam } from "@/app/api/necropsy-systems/exams/[id]/route"
import { POST as createFinding } from "@/app/api/animals/[id]/necropsy/findings/route"
import {
  PATCH as patchFinding,
  DELETE as deleteFinding,
} from "@/app/api/necropsy-findings/[id]/route"
import { PUT as putScreening } from "@/app/api/animals/[id]/necropsy/screening/route"
import { POST as createHisto } from "@/app/api/animals/[id]/histopathology/route"
import { PATCH as patchHisto, DELETE as deleteHisto } from "@/app/api/histopathology/[id]/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RNE")

type ErrorBody = { code: string; params?: Record<string, string> }
type FindingBody = {
  id: string
  lesion: string
  tissue: string | null
  site: string | null
  organ: { id: string } | null
  distribution: string | null
  severity: string | null
  notes: string | null
  parasitesPresent: boolean | null
  parasitesCollected: boolean | null
  parasiteCount: number | null
  position: number
}
type ExamBody = {
  id: string
  status: string | null
  notExaminedReason: string | null
  position: number
  system: { id: string }
  findings: FindingBody[]
}
type HistoBody = { id: string; finding: string; position: number; organ: { id: string } }
type ScreeningBody = {
  anthropicInteraction: boolean | null
  giContentCollected: boolean | null
  giSolidWaste: boolean | null
  giDetailedScreening: boolean | null
  interactions: { type: string; degree: number }[]
}
type ReportBody = { screening: ScreeningBody; systems: ExamBody[]; histopathology: HistoBody[] }

const report = (id: string) => getNecropsy(req(`/api/animals/${id}/necropsy`), ctx({ id }))
const system = (id: string, body: unknown) =>
  putSystem(req(`/api/animals/${id}/necropsy/systems`, { method: "PUT", body }), ctx({ id }))
const dropExam = (id: string) =>
  deleteSystemExam(req(`/api/necropsy-systems/exams/${id}`, { method: "DELETE" }), ctx({ id }))
const finding = (id: string, body: unknown) =>
  createFinding(req(`/api/animals/${id}/necropsy/findings`, { body }), ctx({ id }))
const editFinding = (id: string, body: unknown) =>
  patchFinding(req(`/api/necropsy-findings/${id}`, { method: "PATCH", body }), ctx({ id }))
const dropFinding = (id: string) =>
  deleteFinding(req(`/api/necropsy-findings/${id}`, { method: "DELETE" }), ctx({ id }))
const screening = (id: string, body: unknown) =>
  putScreening(req(`/api/animals/${id}/necropsy/screening`, { method: "PUT", body }), ctx({ id }))
const histo = (id: string, body: unknown) =>
  createHisto(req(`/api/animals/${id}/histopathology`, { body }), ctx({ id }))
const editHisto = (id: string, body: unknown) =>
  patchHisto(req(`/api/histopathology/${id}`, { method: "PATCH", body }), ctx({ id }))
const dropHisto = (id: string) =>
  deleteHisto(req(`/api/histopathology/${id}`, { method: "DELETE" }), ctx({ id }))

const ofP = async () => (await makeAnimal(w, w.researchP)).id
const examOf = (animalId: string, systemId = w.systemId) =>
  prisma.necropsySystemExam.findUnique({
    where: { animalId_systemId: { animalId, systemId } },
    include: { findings: { orderBy: { position: "asc" } } },
  })

/** Sistema já no laudo, gravado direto no banco. */
async function makeExam(
  animalId: string,
  status: "ALTERED" | "NO_CHANGE" | "NOT_EXAMINED" | null,
  systemId = w.systemId,
) {
  const exam = await prisma.necropsySystemExam.create({
    data: {
      animalId,
      systemId,
      status,
      notExaminedReason: status === "NOT_EXAMINED" ? "autólise" : null,
      position: systemId === w.systemId ? 1 : 2,
    },
    select: { id: true },
  })
  return exam.id
}
async function makeFinding(examId: string, over: Record<string, unknown> = {}) {
  const row = await prisma.grossFinding.create({
    data: { examId, lesion: "hemorragia", position: 1, ...over },
    select: { id: true },
  })
  return row.id
}
async function makeHisto(animalId: string, text = "infiltrado inflamatório") {
  const row = await prisma.histopathologyFinding.create({
    data: { animalId, organId: w.organId, finding: text, position: 1 },
    select: { id: true },
  })
  return row.id
}

beforeAll(async () => {
  await seedWorld(w)
})

afterAll(async () => {
  await destroyWorld(w)
})

describe("GET /api/animals/[id]/necropsy", () => {
  let animal: string

  beforeAll(async () => {
    animal = (await makeAnimal(w, w.researchP, { anthropicInteraction: true, giSolidWaste: false }))
      .id
    await makeShare(animal, w.researchQ)
    await prisma.anthropicInteraction.create({
      data: { animalId: animal, type: "FISHERY", degree: 2 },
    })
    // Posições invertidas em relação à ordem de criação: a leitura segue `position`.
    await makeExam(animal, "NO_CHANGE", w.system2Id)
    const first = await makeExam(animal, "ALTERED", w.systemId)
    await makeFinding(first, { lesion: "segunda linha", position: 2 })
    await makeFinding(first, { lesion: "primeira linha", position: 1, organId: w.organId })
    await makeHisto(animal)
  })

  it("devolve triagem, sistemas e achados na ordem do laudo", async () => {
    login(w.as.resP)
    const res = await report(animal)
    expect(res.status).toBe(200)
    const body = await json<ReportBody>(res)
    expect(body.screening).toEqual({
      anthropicInteraction: true,
      giContentCollected: null,
      giSolidWaste: false,
      giDetailedScreening: null,
      interactions: [{ type: "FISHERY", degree: 2 }],
    })
    expect(body.systems.map((s) => [s.system.id, s.status])).toEqual([
      [w.systemId, "ALTERED"],
      [w.system2Id, "NO_CHANGE"],
    ])
    expect(body.systems[0]!.findings.map((f) => f.lesion)).toEqual([
      "primeira linha",
      "segunda linha",
    ])
    expect(body.systems[0]!.findings[0]!.organ?.id).toBe(w.organId)
    expect(body.histopathology).toHaveLength(1)
    expect(body.histopathology[0]).toMatchObject({
      finding: "infiltrado inflamatório",
      organ: { id: w.organId },
    })
  })

  it("a pesquisa com que o indivíduo foi compartilhado lê o MESMO laudo", async () => {
    login(w.as.resQ)
    const body = await json<ReportBody>(await report(animal))
    expect(body.systems).toHaveLength(2)
    expect(body.histopathology).toHaveLength(1)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    expect(await deniedStatuses(w, () => report(animal))).toEqual(DENIED)
    login(w.as.adminA)
    expect((await report(randomUUID())).status).toBe(404)
  })
})

describe("PUT /api/animals/[id]/necropsy/systems", () => {
  it("acrescenta o sistema ao laudo (201) e depois troca o estado no lugar (200), auditando", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const created = await system(animal, { systemId: w.systemId, status: "NO_CHANGE" })
    expect(created.status).toBe(201)
    const exam = await json<ExamBody>(created)
    expect(exam).toMatchObject({ status: "NO_CHANGE", position: 1, system: { id: w.systemId } })

    login(w.as.resP2)
    const updated = await system(animal, {
      systemId: w.systemId,
      status: "NOT_EXAMINED",
      notExaminedReason: "  autólise avançada  ",
    })
    expect(updated.status).toBe(200)
    expect((await json<ExamBody>(updated)).id).toBe(exam.id)
    expect(await examOf(animal)).toMatchObject({
      id: exam.id,
      status: "NOT_EXAMINED",
      notExaminedReason: "autólise avançada",
    })

    // O rótulo do log é o nome do sistema, para continuar legível se o catálogo mudar.
    expect(await auditOf("NecropsySystemExam", exam.id)).toEqual([
      { field: w.name("sys"), oldValue: null, newValue: "NO_CHANGE", userId: w.users.resP },
      {
        field: w.name("sys"),
        oldValue: "NO_CHANGE",
        newValue: "NOT_EXAMINED",
        userId: w.users.resP2,
      },
    ])
  })

  it("sistemas novos entram no fim do laudo; sem estado = 'não avaliado'; o motivo some ao sair de 'não examinado'", async () => {
    const animal = await ofP()
    login(w.as.resP)
    await system(animal, { systemId: w.systemId, status: "NOT_EXAMINED", notExaminedReason: "x" })
    const second = await system(animal, { systemId: w.system2Id })
    expect(second.status).toBe(201)
    expect(await json<ExamBody>(second)).toMatchObject({ status: null, position: 2 })

    expect((await system(animal, { systemId: w.systemId, status: "ALTERED" })).status).toBe(200)
    expect(await examOf(animal)).toMatchObject({ status: "ALTERED", notExaminedReason: null })
  })

  it("não rebaixa um sistema COM achados (409): os achados ficam", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "ALTERED")
    await makeFinding(examId)
    await makeFinding(examId, { position: 2 })
    login(w.as.adminA)
    for (const body of [
      { status: "NO_CHANGE" },
      { status: "NOT_EXAMINED", notExaminedReason: "autólise" },
      { status: null },
    ]) {
      const res = await system(animal, { systemId: w.systemId, ...body })
      expect(res.status).toBe(409)
      const error = await json<ErrorBody>(res)
      expect(error.code).toBe("necropsyFindingsPresent")
      expect(error.params).toEqual({ count: "2" })
    }
    const exam = await examOf(animal)
    expect(exam?.status).toBe("ALTERED")
    expect(exam?.findings).toHaveLength(2)
    expect(await auditOf("NecropsySystemExam", examId)).toEqual([])
  })

  it("motivo é obrigatório em 'não examinado' e proibido nos demais (422); sistema inexistente, 404", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const invalid = [
      { systemId: w.systemId, status: "NOT_EXAMINED" },
      { systemId: w.systemId, status: "NOT_EXAMINED", notExaminedReason: "   " },
      { systemId: w.systemId, status: "NO_CHANGE", notExaminedReason: "autólise" },
      { systemId: w.systemId, status: "QUALQUER" },
      { status: "NO_CHANGE" },
    ]
    for (const body of invalid) {
      const res = await system(animal, body)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    const missing = await system(animal, { systemId: randomUUID(), status: "NO_CHANGE" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("systemNotFound")
    expect(await prisma.necropsySystemExam.count({ where: { animalId: animal } })).toBe(0)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const attempt = () => system(animal, { systemId: w.systemId, status: "NO_CHANGE" })
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    expect(await prisma.necropsySystemExam.count({ where: { animalId: animal } })).toBe(0)
    login(w.as.adminA)
    expect((await system(randomUUID(), { systemId: w.systemId, status: "NO_CHANGE" })).status).toBe(
      404,
    )
  })
})

describe("DELETE /api/necropsy-systems/exams/[id]", () => {
  it("tira o sistema do laudo e audita com o estado que ele tinha; o catálogo fica", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "NO_CHANGE")
    login(w.as.resP)
    expect((await dropExam(examId)).status).toBe(204)
    expect(await examOf(animal)).toBeNull()
    expect(await prisma.necropsySystem.count({ where: { id: w.systemId } })).toBe(1)
    expect(await auditOf("NecropsySystemExam", examId)).toEqual([
      { field: w.name("sys"), oldValue: "NO_CHANGE", newValue: null, userId: w.users.resP },
    ])
  })

  it("recusa (409) se o sistema tem achados — nada é apagado", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "ALTERED")
    const findingId = await makeFinding(examId)
    login(w.as.adminA)
    const res = await dropExam(examId)
    expect(res.status).toBe(409)
    expect((await json<ErrorBody>(res)).code).toBe("necropsyFindingsPresent")
    expect((await examOf(animal))?.findings.map((f) => f.id)).toEqual([findingId])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "NO_CHANGE")
    expect(await deniedStatuses(w, () => dropExam(examId))).toEqual(DENIED)
    expect(await examOf(animal)).not.toBeNull()
    login(w.as.adminA)
    const missing = await dropExam(randomUUID())
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("necropsyExamNotFound")
  })
})

describe("POST /api/animals/[id]/necropsy/findings", () => {
  it("cria o achado e, no mesmo gesto, põe o sistema no laudo como 'com alteração'", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await finding(animal, {
      systemId: w.systemId,
      organId: w.organId,
      tissue: "parênquima",
      site: "lobo direito",
      lesion: "  nódulos esbranquiçados  ",
      distribution: "multifocal",
      severity: "moderate",
      notes: "até 3 mm",
      parasitesPresent: true,
      parasitesCollected: true,
      parasiteCount: 12,
    })
    expect(res.status).toBe(201)
    const body = await json<FindingBody>(res)
    expect(body).toMatchObject({
      lesion: "nódulos esbranquiçados",
      tissue: "parênquima",
      site: "lobo direito",
      organ: { id: w.organId },
      distribution: "multifocal",
      severity: "moderate",
      notes: "até 3 mm",
      parasitesPresent: true,
      parasitesCollected: true,
      parasiteCount: 12,
      position: 1,
    })

    const exam = await examOf(animal)
    expect(exam).toMatchObject({ status: "ALTERED", position: 1 })
    expect(exam?.findings.map((f) => f.id)).toEqual([body.id])
    expect(await auditOf("GrossFinding", body.id)).toEqual([
      {
        field: "created",
        oldValue: null,
        newValue: "nódulos esbranquiçados",
        userId: w.users.resP,
      },
    ])
  })

  it("promove a 'com alteração' o sistema já avaliado, limpa o motivo e numera as linhas", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "NOT_EXAMINED")
    login(w.as.resP)
    const first = await json<FindingBody>(
      await finding(animal, { systemId: w.systemId, lesion: "edema" }),
    )
    const second = await json<FindingBody>(
      await finding(animal, { systemId: w.systemId, lesion: "congestão" }),
    )
    expect([first.position, second.position]).toEqual([1, 2])
    expect(first).toMatchObject({ organ: null, parasitesPresent: null, parasiteCount: null })
    expect(await examOf(animal)).toMatchObject({
      id: examId,
      status: "ALTERED",
      notExaminedReason: null,
    })
  })

  it("quantidade de parasitas só com 'coletados: sim'; valida lesão e vocabulários (422)", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const base = { systemId: w.systemId, lesion: "úlcera" }
    const invalid = [
      { ...base, parasitesCollected: false, parasiteCount: 3 },
      { ...base, parasitesCollected: null, parasiteCount: 3 },
      { ...base, parasitesCollected: true, parasiteCount: -1 },
      { ...base, parasitesCollected: true, parasiteCount: 1.5 },
      { ...base, lesion: "" },
      { ...base, distribution: "espalhada" },
      { ...base, severity: "grave" },
      { ...base, tissue: "x".repeat(31) },
      { lesion: "úlcera" },
    ]
    for (const body of invalid) {
      const res = await finding(animal, body)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    // Recusado antes de mexer no laudo: o sistema nem chega a entrar.
    expect(await examOf(animal)).toBeNull()
  })

  it("sistema ou órgão inexistentes respondem 404 sem criar nada", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const noSystem = await finding(animal, { systemId: randomUUID(), lesion: "úlcera" })
    expect(noSystem.status).toBe(404)
    expect((await json<ErrorBody>(noSystem)).code).toBe("systemNotFound")
    const noOrgan = await finding(animal, {
      systemId: w.systemId,
      organId: randomUUID(),
      lesion: "úlcera",
    })
    expect(noOrgan.status).toBe(404)
    expect((await json<ErrorBody>(noOrgan)).code).toBe("organNotFound")
    expect(await examOf(animal)).toBeNull()
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const attempt = () => finding(animal, { systemId: w.systemId, lesion: "úlcera" })
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    expect(await examOf(animal)).toBeNull()
    login(w.as.adminA)
    expect((await finding(randomUUID(), { systemId: w.systemId, lesion: "x" })).status).toBe(404)
  })
})

describe("PATCH /api/necropsy-findings/[id]", () => {
  it("altera só os campos enviados e audita cada mudança com valor antigo e novo", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "ALTERED")
    const id = await makeFinding(examId, {
      organId: w.organId,
      tissue: "mucosa",
      severity: "mild",
      notes: "antes",
    })
    login(w.as.resP2)
    const res = await editFinding(id, {
      lesion: "hemorragia petequial",
      severity: "marked",
      notes: null,
      organId: null,
      parasitesPresent: false,
    })
    expect(res.status).toBe(200)
    expect(await json<FindingBody>(res)).toMatchObject({
      id,
      lesion: "hemorragia petequial",
      severity: "marked",
      notes: null,
      organ: null,
      tissue: "mucosa", // não enviado: intacto
      parasitesPresent: false,
    })
    const row = await prisma.grossFinding.findUniqueOrThrow({ where: { id } })
    expect(row).toMatchObject({
      lesion: "hemorragia petequial",
      severity: "marked",
      notes: null,
      organId: null,
      tissue: "mucosa",
      parasitesPresent: false,
    })

    const log = await auditOf("GrossFinding", id)
    expect(log.every((l) => l.userId === w.users.resP2)).toBe(true)
    expect(Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))).toEqual({
      lesion: ["hemorragia", "hemorragia petequial"],
      severity: ["mild", "marked"],
      notes: ["antes", null],
      parasitesPresent: [null, "false"],
    })
  })

  it("vincula outro órgão do catálogo; órgão inexistente é 404", async () => {
    const animal = await ofP()
    const id = await makeFinding(await makeExam(animal, "ALTERED"), { organId: w.organId })
    login(w.as.resP)
    expect((await editFinding(id, { organId: w.organ2Id })).status).toBe(200)
    expect((await prisma.grossFinding.findUniqueOrThrow({ where: { id } })).organId).toBe(
      w.organ2Id,
    )

    const missing = await editFinding(id, { organId: randomUUID() })
    expect(missing.status).toBe(404)
    expect((await prisma.grossFinding.findUniqueOrThrow({ where: { id } })).organId).toBe(
      w.organ2Id,
    )
  })

  it("valida o corpo (422) sem alterar o achado", async () => {
    const animal = await ofP()
    const id = await makeFinding(await makeExam(animal, "ALTERED"))
    login(w.as.resP)
    const invalid = [
      { lesion: "" },
      { severity: "grave" },
      { parasitesCollected: false, parasiteCount: 2 },
      { parasiteCount: -1 },
    ]
    for (const body of invalid) {
      const res = await editFinding(id, body)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    expect(await prisma.grossFinding.findUniqueOrThrow({ where: { id } })).toMatchObject({
      lesion: "hemorragia",
      severity: null,
      parasiteCount: null,
    })
    expect(await auditOf("GrossFinding", id)).toEqual([])
  })

  // BUG: a regra "quantidade só se coletados" é conferida apenas quando os DOIS campos vêm no
  // corpo. Marcar "coletados: não" num achado que já tinha quantidade deixa gravado
  // "coletado: não · quantidade: 4" — a contradição que o schema diz impedir. A quantidade
  // deveria ser limpa (ou a edição recusada).
  it.fails("marcar 'parasitas coletados: não' não deixa a quantidade antiga gravada", async () => {
    const animal = await ofP()
    const id = await makeFinding(await makeExam(animal, "ALTERED"), {
      parasitesPresent: true,
      parasitesCollected: true,
      parasiteCount: 4,
    })
    login(w.as.resP)
    const res = await editFinding(id, { parasitesCollected: false })
    const row = await prisma.grossFinding.findUniqueOrThrow({ where: { id } })
    expect(res.status === 422 || row.parasiteCount === null).toBe(true)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const id = await makeFinding(await makeExam(animal, "ALTERED"))
    expect(await deniedStatuses(w, () => editFinding(id, { lesion: "invadido" }))).toEqual(DENIED)
    expect((await prisma.grossFinding.findUniqueOrThrow({ where: { id } })).lesion).toBe(
      "hemorragia",
    )
    login(w.as.adminA)
    const missing = await editFinding(randomUUID(), { lesion: "x" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("necropsyFindingNotFound")
  })
})

describe("DELETE /api/necropsy-findings/[id]", () => {
  it("remove a linha, audita com a lesão e mantém o sistema 'com alteração'", async () => {
    const animal = await ofP()
    const examId = await makeExam(animal, "ALTERED")
    const id = await makeFinding(examId)
    login(w.as.resP)
    expect((await dropFinding(id)).status).toBe(204)
    expect(await prisma.grossFinding.count({ where: { id } })).toBe(0)
    expect(await examOf(animal)).toMatchObject({ id: examId, status: "ALTERED" })
    expect(await auditOf("GrossFinding", id)).toEqual([
      { field: "deleted", oldValue: "hemorragia", newValue: null, userId: w.users.resP },
    ])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const id = await makeFinding(await makeExam(animal, "ALTERED"))
    expect(await deniedStatuses(w, () => dropFinding(id))).toEqual(DENIED)
    expect(await prisma.grossFinding.count({ where: { id } })).toBe(1)
    login(w.as.adminA)
    expect((await dropFinding(randomUUID())).status).toBe(404)
  })
})

describe("PUT /api/animals/[id]/necropsy/screening", () => {
  const flags = (id: string) =>
    prisma.animal.findUniqueOrThrow({
      where: { id },
      select: {
        anthropicInteraction: true,
        giContentCollected: true,
        giSolidWaste: true,
        giDetailedScreening: true,
        anthropicInteractions: { select: { type: true, degree: true }, orderBy: { type: "asc" } },
      },
    })

  it("grava as quatro respostas e as interações, e audita como campos do indivíduo", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await screening(animal, {
      anthropicInteraction: true,
      giContentCollected: true,
      giSolidWaste: false,
      interactions: [
        { type: "VESSEL", degree: 1 },
        { type: "FISHERY", degree: 2 },
      ],
    })
    expect(res.status).toBe(200)
    const expected = {
      anthropicInteraction: true,
      giContentCollected: true,
      giSolidWaste: false,
      giDetailedScreening: null, // ausente no corpo = "não informado"
    }
    expect(await json<ScreeningBody>(res)).toEqual({
      ...expected,
      interactions: [
        { type: "FISHERY", degree: 2 },
        { type: "VESSEL", degree: 1 },
      ],
    })
    expect(await flags(animal)).toEqual({
      ...expected,
      anthropicInteractions: [
        { type: "FISHERY", degree: 2 },
        { type: "VESSEL", degree: 1 },
      ],
    })

    const log = await auditOf("Animal", animal)
    expect(log.every((l) => l.userId === w.users.resP)).toBe(true)
    expect(Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))).toEqual({
      anthropicInteraction: [null, "true"],
      giContentCollected: [null, "true"],
      giSolidWaste: [null, "false"],
      anthropicInteractions: [null, "FISHERY:2, VESSEL:1"],
    })
  })

  it("o corpo SUBSTITUI o bloco: o que não veio sai, e a auditoria mostra antes e depois", async () => {
    const animal = (
      await makeAnimal(w, w.researchP, { anthropicInteraction: true, giSolidWaste: true })
    ).id
    await prisma.anthropicInteraction.createMany({
      data: [
        { animalId: animal, type: "FISHERY", degree: 2 },
        { animalId: animal, type: "WASTE", degree: 3 },
      ],
    })
    login(w.as.resP2)
    const res = await screening(animal, { anthropicInteraction: false })
    expect(res.status).toBe(200)
    expect(await flags(animal)).toEqual({
      anthropicInteraction: false,
      giContentCollected: null,
      giSolidWaste: null,
      giDetailedScreening: null,
      anthropicInteractions: [],
    })
    const log = await auditOf("Animal", animal)
    expect(Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))).toEqual({
      anthropicInteraction: ["true", "false"],
      giSolidWaste: ["true", null],
      anthropicInteractions: ["FISHERY:2, WASTE:3", null],
    })
  })

  it("recusa laudo contraditório (422): interação sem indício, tipo repetido, grau fora de 1–3", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const invalid = [
      { anthropicInteraction: false, interactions: [{ type: "FISHERY", degree: 1 }] },
      { interactions: [{ type: "FISHERY", degree: 1 }] },
      {
        anthropicInteraction: true,
        interactions: [
          { type: "FISHERY", degree: 1 },
          { type: "FISHERY", degree: 3 },
        ],
      },
      { anthropicInteraction: true, interactions: [{ type: "FISHERY", degree: 4 }] },
      { anthropicInteraction: true, interactions: [{ type: "FISHERY", degree: 0 }] },
      { anthropicInteraction: true, interactions: [{ type: "TURISMO", degree: 1 }] },
      { anthropicInteraction: "sim" },
    ]
    for (const body of invalid) {
      const res = await screening(animal, body)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    expect(await flags(animal)).toMatchObject({
      anthropicInteraction: null,
      anthropicInteractions: [],
    })
    expect(await auditOf("Animal", animal)).toEqual([])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const attempt = () => screening(animal, { anthropicInteraction: true })
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    expect((await flags(animal)).anthropicInteraction).toBeNull()
    login(w.as.adminA)
    expect((await screening(randomUUID(), { anthropicInteraction: true })).status).toBe(404)
  })
})

describe("POST /api/animals/[id]/histopathology", () => {
  it("cria o achado numerado na ordem de entrada e audita a criação", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await histo(animal, { organId: w.organId, finding: "  necrose multifocal  " })
    expect(res.status).toBe(201)
    const body = await json<HistoBody>(res)
    expect(body).toMatchObject({
      finding: "necrose multifocal",
      position: 1,
      organ: { id: w.organId },
    })
    // O mesmo órgão pode render mais de uma linha.
    const second = await json<HistoBody>(
      await histo(animal, { organId: w.organId, finding: "fibrose" }),
    )
    expect(second.position).toBe(2)

    const rows = await prisma.histopathologyFinding.findMany({
      where: { animalId: animal },
      orderBy: { position: "asc" },
    })
    expect(rows.map((r) => [r.id, r.organId, r.finding])).toEqual([
      [body.id, w.organId, "necrose multifocal"],
      [second.id, w.organId, "fibrose"],
    ])
    expect(await auditOf("HistopathologyFinding", body.id)).toEqual([
      { field: "created", oldValue: null, newValue: "necrose multifocal", userId: w.users.resP },
    ])
  })

  it("a pesquisa com que o indivíduo foi compartilhado também escreve no laudo; pendente, não", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ, { status: "PENDING" })
    login(w.as.resQ)
    expect((await histo(animal, { organId: w.organId, finding: "edema" })).status).toBe(403)
    await prisma.animalResearch.update({
      where: { animalId_researchId: { animalId: animal, researchId: w.researchQ } },
      data: { status: "ACCEPTED" },
    })
    expect((await histo(animal, { organId: w.organId, finding: "edema" })).status).toBe(201)
    expect(await prisma.histopathologyFinding.count({ where: { animalId: animal } })).toBe(1)
  })

  it("valida o corpo (422) e o órgão (404)", async () => {
    const animal = await ofP()
    login(w.as.resP)
    for (const body of [
      { organId: w.organId, finding: "" },
      { finding: "edema" },
      { organId: w.organId, finding: "x".repeat(501) },
    ]) {
      expect((await histo(animal, body)).status).toBe(422)
    }
    const missing = await histo(animal, { organId: randomUUID(), finding: "edema" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("organNotFound")
    expect(await prisma.histopathologyFinding.count({ where: { animalId: animal } })).toBe(0)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const attempt = () => histo(animal, { organId: w.organId, finding: "edema" })
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    expect(await prisma.histopathologyFinding.count({ where: { animalId: animal } })).toBe(0)
    login(w.as.adminA)
    expect((await histo(randomUUID(), { organId: w.organId, finding: "x" })).status).toBe(404)
  })
})

describe("PATCH /api/histopathology/[id]", () => {
  it("altera texto e órgão; a auditoria guarda o texto antigo e o novo", async () => {
    const animal = await ofP()
    const id = await makeHisto(animal, "infiltrado discreto")
    login(w.as.resP2)
    const res = await editHisto(id, { finding: " infiltrado acentuado ", organId: w.organ2Id })
    expect(res.status).toBe(200)
    expect(await json<HistoBody>(res)).toMatchObject({
      id,
      finding: "infiltrado acentuado",
      organ: { id: w.organ2Id },
    })
    expect(await prisma.histopathologyFinding.findUniqueOrThrow({ where: { id } })).toMatchObject({
      finding: "infiltrado acentuado",
      organId: w.organ2Id,
    })
    expect(await auditOf("HistopathologyFinding", id)).toEqual([
      {
        field: "finding",
        oldValue: "infiltrado discreto",
        newValue: "infiltrado acentuado",
        userId: w.users.resP2,
      },
    ])
  })

  it("valida o corpo (422) e o órgão (404) sem alterar o achado", async () => {
    const animal = await ofP()
    const id = await makeHisto(animal, "original")
    login(w.as.resP)
    expect((await editHisto(id, { finding: "" })).status).toBe(422)
    expect((await editHisto(id, { organId: randomUUID() })).status).toBe(404)
    expect(await prisma.histopathologyFinding.findUniqueOrThrow({ where: { id } })).toMatchObject({
      finding: "original",
      organId: w.organId,
    })
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const id = await makeHisto(animal, "original")
    expect(await deniedStatuses(w, () => editHisto(id, { finding: "invadido" }))).toEqual(DENIED)
    expect((await prisma.histopathologyFinding.findUniqueOrThrow({ where: { id } })).finding).toBe(
      "original",
    )
    login(w.as.adminA)
    const missing = await editHisto(randomUUID(), { finding: "x" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("histopathologyFindingNotFound")
  })
})

describe("DELETE /api/histopathology/[id]", () => {
  it("remove o achado e audita com o texto que ele tinha", async () => {
    const animal = await ofP()
    const id = await makeHisto(animal, "granuloma")
    login(w.as.resP)
    expect((await dropHisto(id)).status).toBe(204)
    expect(await prisma.histopathologyFinding.count({ where: { id } })).toBe(0)
    expect(await auditOf("HistopathologyFinding", id)).toEqual([
      { field: "deleted", oldValue: "granuloma", newValue: null, userId: w.users.resP },
    ])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const id = await makeHisto(animal)
    expect(await deniedStatuses(w, () => dropHisto(id))).toEqual(DENIED)
    expect(await prisma.histopathologyFinding.count({ where: { id } })).toBe(1)
    login(w.as.adminA)
    expect((await dropHisto(randomUUID())).status).toBe(404)
  })
})
