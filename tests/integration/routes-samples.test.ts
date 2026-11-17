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

// Rotas de AMOSTRA, chamadas pelos handlers reais contra o banco de testes:
//   GET/POST   /api/animals/[id]/samples
//   PUT/DELETE /api/samples/[id]
//
// O que protegem: a amostra pertence à pesquisa que a coletou (num indivíduo compartilhado,
// cada pesquisa lista e mexe só nas suas); a identificação é única DENTRO da pesquisa; só
// exclui quem cadastrou (ou o admin, ou qualquer membro se a amostra está sem autor) e nunca
// com análises lançadas; criação e edição vão para a auditoria com autor e valores.

import { GET as listSamples, POST as createSample } from "@/app/api/animals/[id]/samples/route"
import { PUT as updateSample, DELETE as deleteSample } from "@/app/api/samples/[id]/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RSA")

let solo: string // indivíduo só da pesquisa P
let shared: string // primária P, compartilhado (aceito) com Q
let pending: string // primária P, convite PENDENTE para Q

type SampleBody = {
  id: string
  identification: string
  sampleType: string
  status: string
  storageTemp: number | null
  notes: string | null
  createdById: string | null
  organ: { id: string }
  research: { id: string }
  _count: { analyses: number }
}
type ErrorBody = { code: string }

const list = (animalId: string) =>
  listSamples(req(`/api/animals/${animalId}/samples`), ctx({ id: animalId }))
const create = (animalId: string, body: unknown) =>
  createSample(req(`/api/animals/${animalId}/samples`, { body }), ctx({ id: animalId }))
const update = (id: string, body: unknown) =>
  updateSample(req(`/api/samples/${id}`, { method: "PUT", body }), ctx({ id }))
const remove = (id: string) =>
  deleteSample(req(`/api/samples/${id}`, { method: "DELETE" }), ctx({ id }))

const valid = (researchId: string, identification: string) => ({
  researchId,
  organId: w.organId,
  identification,
  sampleType: "Tecido fresco",
})
const exists = async (id: string) =>
  (await prisma.sample.findUnique({ where: { id }, select: { id: true } })) !== null

beforeAll(async () => {
  await seedWorld(w)
  solo = (await makeAnimal(w, w.researchP)).id
  shared = (await makeAnimal(w, w.researchP)).id
  await makeShare(shared, w.researchQ)
  pending = (await makeAnimal(w, w.researchP)).id
  await makeShare(pending, w.researchQ, { status: "PENDING" })
})

afterAll(async () => {
  await destroyWorld(w)
})

describe("GET /api/animals/[id]/samples", () => {
  let ofP: string
  let ofQ: string

  beforeAll(async () => {
    const p = await makeSample(w, shared, w.researchP)
    ofP = p.id
    ofQ = (await makeSample(w, shared, w.researchQ)).id
    await makeScreening(w, p.id, "NEGATIVO")
  })

  it("devolve as amostras com órgão, pesquisa dona e contagem de análises", async () => {
    login(w.as.adminA)
    const res = await list(shared)
    expect(res.status).toBe(200)
    const rows = await json<SampleBody[]>(res)
    expect(rows.map((r) => r.id).sort()).toEqual([ofP, ofQ].sort())
    const p = rows.find((r) => r.id === ofP)!
    expect(p.organ.id).toBe(w.organId)
    expect(p.research.id).toBe(w.researchP)
    expect(p._count.analyses).toBe(1)
  })

  it("no indivíduo compartilhado, cada pesquisador lista só as amostras da sua pesquisa", async () => {
    login(w.as.resP)
    expect((await json<SampleBody[]>(await list(shared))).map((r) => r.id)).toEqual([ofP])
    login(w.as.resQ)
    expect((await json<SampleBody[]>(await list(shared))).map((r) => r.id)).toEqual([ofQ])
    login(w.as.resPQ)
    expect((await json<SampleBody[]>(await list(shared))).map((r) => r.id).sort()).toEqual(
      [ofP, ofQ].sort(),
    )
  })

  it("convite pendente não dá acesso às amostras do indivíduo", async () => {
    login(w.as.resQ)
    expect((await list(pending)).status).toBe(403)
    login(w.as.resP)
    expect((await list(pending)).status).toBe(200)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo", async () => {
    expect(await deniedStatuses(w, () => list(shared))).toEqual(DENIED)
  })

  it("indivíduo inexistente responde 404", async () => {
    login(w.as.adminA)
    expect((await list(randomUUID())).status).toBe(404)
  })
})

describe("POST /api/animals/[id]/samples", () => {
  it("cria a amostra na pesquisa escolhida, com autor, e registra a criação na auditoria", async () => {
    login(w.as.resP)
    const identification = `${w.tag} FIG`
    const res = await create(solo, {
      ...valid(w.researchP, `  ${identification}  `),
      collectionDate: "2026-03-10",
      storageLocation: "Freezer A",
      storageTemp: -80,
      status: "IN_USE",
      notes: "fragmento",
    })
    expect(res.status).toBe(201)
    const body = await json<SampleBody>(res)
    expect(body.identification).toBe(identification)
    expect(body.research.id).toBe(w.researchP)

    const row = await prisma.sample.findUniqueOrThrow({ where: { id: body.id } })
    expect(row).toMatchObject({
      animalId: solo,
      researchId: w.researchP,
      orgId: w.orgA,
      organId: w.organId,
      identification,
      sampleType: "Tecido fresco",
      storageLocation: "Freezer A",
      storageTemp: -80,
      status: "IN_USE",
      notes: "fragmento",
      createdById: w.users.resP,
    })
    expect(row.collectionDate?.toISOString().slice(0, 10)).toBe("2026-03-10")

    expect(await auditOf("Sample", body.id)).toEqual([
      { field: "created", oldValue: null, newValue: identification, userId: w.users.resP },
    ])
  })

  it("recusa identificação repetida na MESMA pesquisa (409) e não cria a segunda", async () => {
    login(w.as.resP)
    const identification = `${w.tag} DUP`
    expect((await create(solo, valid(w.researchP, identification))).status).toBe(201)
    const again = await create(solo, valid(w.researchP, identification))
    expect(again.status).toBe(409)
    expect((await json<ErrorBody>(again)).code).toBe("sampleIdentificationDuplicate")
    expect(await prisma.sample.count({ where: { researchId: w.researchP, identification } })).toBe(
      1,
    )
  })

  it("aceita a mesma identificação em OUTRA pesquisa do indivíduo compartilhado", async () => {
    const identification = `${w.tag} CMP`
    login(w.as.resP)
    expect((await create(shared, valid(w.researchP, identification))).status).toBe(201)
    login(w.as.resQ)
    const res = await create(shared, valid(w.researchQ, identification))
    expect(res.status).toBe(201)
    expect(await prisma.sample.count({ where: { animalId: shared, identification } })).toBe(2)
  })

  it("pesquisador não cria amostra em nome de pesquisa que não integra", async () => {
    login(w.as.resQ)
    const identification = `${w.tag} ALHEIA`
    const res = await create(shared, valid(w.researchP, identification))
    expect(res.status).toBe(403)
    expect(await prisma.sample.count({ where: { identification } })).toBe(0)
  })

  it("a pesquisa dona precisa estudar o indivíduo — convite pendente não conta (422)", async () => {
    login(w.as.adminA)
    for (const animalId of [solo, pending]) {
      const res = await create(animalId, valid(w.researchQ, `${w.tag} NV ${animalId}`))
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("animalResearchNotLinked")
    }
    expect(await prisma.sample.count({ where: { researchId: w.researchQ, animalId: solo } })).toBe(
      0,
    )
    expect(await prisma.sample.count({ where: { animalId: pending } })).toBe(0)
  })

  it("material biológico inexistente responde 404", async () => {
    login(w.as.resP)
    const res = await create(solo, { ...valid(w.researchP, `${w.tag} ORG`), organId: randomUUID() })
    expect(res.status).toBe(404)
    expect((await json<ErrorBody>(res)).code).toBe("organNotFound")
  })

  it.each([
    ["sem identificação", { identification: "   " }],
    ["sem tipo de amostra", { sampleType: "" }],
    ["status fora da lista", { status: "PERDIDA" }],
    ["data de coleta fora do formato ISO", { collectionDate: "10/03/2026" }],
    ["temperatura não numérica", { storageTemp: "-80" }],
  ])("valida o corpo (422): %s", async (_name, over) => {
    login(w.as.resP)
    const identification = `${w.tag} INV ${_name}`
    const res = await create(solo, { ...valid(w.researchP, identification), ...over })
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("validation")
    expect(await prisma.sample.count({ where: { identification } })).toBe(0)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo", async () => {
    const identification = `${w.tag} NEGADA`
    expect(await deniedStatuses(w, () => create(solo, valid(w.researchP, identification)))).toEqual(
      DENIED,
    )
    expect(await prisma.sample.count({ where: { identification } })).toBe(0)
  })
})

describe("PUT /api/samples/[id]", () => {
  it("altera os campos e registra cada mudança na auditoria, com autor e valores", async () => {
    const sample = await makeSample(w, solo, w.researchP, {
      createdById: w.users.resP,
      storageTemp: -20,
      notes: "antes",
    })
    // Editar é de qualquer membro da pesquisa: aqui o colega, não o autor.
    login(w.as.resP2)
    const identification = `${sample.identification} R`
    const res = await update(sample.id, {
      identification,
      status: "DEPLETED",
      storageTemp: -80,
      notes: null,
      collectionDate: "2026-04-01",
    })
    expect(res.status).toBe(200)
    expect(await json<SampleBody>(res)).toMatchObject({
      id: sample.id,
      identification,
      status: "DEPLETED",
      storageTemp: -80,
      notes: null,
    })

    const row = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } })
    expect(row).toMatchObject({ identification, status: "DEPLETED", storageTemp: -80, notes: null })
    expect(row.createdById).toBe(w.users.resP)

    const log = await auditOf("Sample", sample.id)
    expect(log.every((l) => l.userId === w.users.resP2)).toBe(true)
    const byField = Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))
    expect(byField).toEqual({
      identification: [sample.identification, identification],
      status: ["STORED", "DEPLETED"],
      storageTemp: ["-20", "-80"],
      notes: ["antes", null],
      collectionDate: [null, new Date("2026-04-01").toISOString()],
    })
  })

  it("gravar os mesmos valores não gera linha de auditoria", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    const res = await update(sample.id, { identification: sample.identification, status: "STORED" })
    expect(res.status).toBe(200)
    expect(await auditOf("Sample", sample.id)).toEqual([])
  })

  it("recusa identificação que já existe na pesquisa (409) e mantém a original", async () => {
    const a = await makeSample(w, solo, w.researchP)
    const b = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    const res = await update(b.id, { identification: a.identification })
    expect(res.status).toBe(409)
    expect((await json<ErrorBody>(res)).code).toBe("sampleIdentificationDuplicate")
    const row = await prisma.sample.findUniqueOrThrow({ where: { id: b.id } })
    expect(row.identification).toBe(b.identification)
  })

  it("a pesquisa dona não muda pela edição", async () => {
    const sample = await makeSample(w, shared, w.researchP)
    login(w.as.adminA)
    const res = await update(sample.id, { researchId: w.researchQ, notes: "tentativa" })
    expect(res.status).toBe(200)
    const row = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } })
    expect(row.researchId).toBe(w.researchP)
    expect(row.notes).toBe("tentativa")
  })

  it("troca o material biológico de uma amostra ainda sem análises", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    const res = await update(sample.id, { organId: w.organ2Id })
    expect(res.status).toBe(200)
    expect((await json<SampleBody>(res)).organ.id).toBe(w.organ2Id)
    const row = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } })
    expect(row.organId).toBe(w.organ2Id)
  })

  // BUG: a célula da grade é (órgão da amostra × patógeno × exame). Trocar o órgão de uma
  // amostra com resultados lançados desloca esses resultados para um órgão em que nunca foram
  // feitos — e fora do protocolo. Deveria ser recusado (409) ou, no mínimo, ficar na auditoria.
  it.fails("troca de material biológico com análises lançadas é barrada ou auditada", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    await makeScreening(w, sample.id, "POSITIVO")
    login(w.as.resP)
    const res = await update(sample.id, { organId: w.organ2Id })
    const audited = (await auditOf("Sample", sample.id)).some((l) => /organ/i.test(l.field))
    expect(res.status === 409 || audited).toBe(true)
  })

  it("pesquisador de outra pesquisa do indivíduo compartilhado não edita a amostra alheia", async () => {
    const sample = await makeSample(w, shared, w.researchP, { notes: "de P" })
    login(w.as.resQ)
    expect((await update(sample.id, { notes: "de Q" })).status).toBe(403)
    const row = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } })
    expect(row.notes).toBe("de P")
  })

  it("valida o corpo (422) e o material biológico (404)", async () => {
    const sample = await makeSample(w, solo, w.researchP)
    login(w.as.resP)
    expect((await update(sample.id, { status: "PERDIDA" })).status).toBe(422)
    expect((await update(sample.id, { identification: "" })).status).toBe(422)
    const organ = await update(sample.id, { organId: randomUUID() })
    expect(organ.status).toBe(404)
    expect((await json<ErrorBody>(organ)).code).toBe("organNotFound")
    const row = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } })
    expect(row).toMatchObject({ status: "STORED", identification: sample.identification })
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const sample = await makeSample(w, solo, w.researchP, { notes: "intacta" })
    expect(await deniedStatuses(w, () => update(sample.id, { notes: "invadida" }))).toEqual(DENIED)
    const row = await prisma.sample.findUniqueOrThrow({ where: { id: sample.id } })
    expect(row.notes).toBe("intacta")

    login(w.as.adminA)
    const missing = await update(randomUUID(), { notes: "x" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("sampleNotFound")
  })
})

describe("DELETE /api/samples/[id]", () => {
  it("quem cadastrou exclui a própria amostra", async () => {
    const sample = await makeSample(w, solo, w.researchP, { createdById: w.users.resP })
    login(w.as.resP)
    expect((await remove(sample.id)).status).toBe(204)
    expect(await exists(sample.id)).toBe(false)
  })

  it("colega da mesma pesquisa não exclui amostra de outro autor; o admin exclui", async () => {
    const sample = await makeSample(w, solo, w.researchP, { createdById: w.users.resP })
    login(w.as.resP2)
    const denied = await remove(sample.id)
    expect(denied.status).toBe(403)
    expect((await json<ErrorBody>(denied)).code).toBe("sampleDeleteNotCreator")
    expect(await exists(sample.id)).toBe(true)

    login(w.as.adminA)
    expect((await remove(sample.id)).status).toBe(204)
    expect(await exists(sample.id)).toBe(false)
  })

  it("amostra sem autor: qualquer membro da pesquisa dona exclui — e só dela", async () => {
    const sample = await makeSample(w, shared, w.researchP, { createdById: null })
    login(w.as.resQ)
    expect((await remove(sample.id)).status).toBe(403)
    expect(await exists(sample.id)).toBe(true)

    login(w.as.resP2)
    expect((await remove(sample.id)).status).toBe(204)
    expect(await exists(sample.id)).toBe(false)
  })

  it("amostra com análises não é excluída (409), nem pelo admin", async () => {
    const sample = await makeSample(w, solo, w.researchP, { createdById: w.users.resP })
    const analysisId = await makeScreening(w, sample.id, "NEGATIVO")
    for (const user of [w.as.resP, w.as.adminA]) {
      login(user)
      const res = await remove(sample.id)
      expect(res.status).toBe(409)
      expect((await json<ErrorBody>(res)).code).toBe("sampleHasAnalyses")
    }
    expect(await exists(sample.id)).toBe(true)
    expect(await prisma.analysis.count({ where: { id: analysisId } })).toBe(1)
  })

  // BUG: a criação da amostra entra na timeline do indivíduo ("created"), mas a exclusão some
  // sem rastro — nenhum AuditLog diz quem apagou nem qual era a identificação.
  it.fails("a exclusão deixa um evento de auditoria com o autor e a identificação", async () => {
    const sample = await makeSample(w, solo, w.researchP, { createdById: w.users.resP })
    login(w.as.resP)
    expect((await remove(sample.id)).status).toBe(204)
    const log = await prisma.auditLog.findMany({
      where: { userId: w.users.resP, oldValue: sample.identification, newValue: null },
    })
    expect(log.length).toBeGreaterThan(0)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const sample = await makeSample(w, solo, w.researchP, { createdById: null })
    expect(await deniedStatuses(w, () => remove(sample.id))).toEqual(DENIED)
    expect(await exists(sample.id)).toBe(true)

    login(w.as.adminA)
    expect((await remove(randomUUID())).status).toBe(404)
  })
})
