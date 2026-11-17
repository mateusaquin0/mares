import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, req } from "./helpers/route"
import { createFixtures } from "./helpers/org-fixtures"

// Gancho para o teste de corrida: roda logo DEPOIS de o item ser criado na aprovação e antes
// de a solicitação ser marcada como aprovada — a janela em que outro curador pode decidir.
// Fora desse teste o gancho fica vazio e `createCatalogItem` é o de produção, sem alteração.
const race = vi.hoisted(() => ({ afterCreate: null as null | (() => Promise<void>) }))
vi.mock("@/lib/catalog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/catalog")>()
  return {
    ...original,
    createCatalogItem: async (...args: Parameters<typeof original.createCatalogItem>) => {
      const item = await original.createCatalogItem(...args)
      const hook = race.afterCreate
      race.afterCreate = null
      if (hook) await hook()
      return item
    },
  }
})

import { GET as listQueue, POST as openRequest } from "@/app/api/catalog-requests/route"
import { GET as listMine } from "@/app/api/catalog-requests/mine/route"
import { POST as approve } from "@/app/api/catalog-requests/[id]/approve/route"
import { POST as reject } from "@/app/api/catalog-requests/[id]/reject/route"

// Fila de solicitações do glossário pelas rotas: qualquer autenticado pede; admin de grupo ou
// admin global decide (nunca a própria solicitação). A regra do item em si é coberta em
// catalog-requests.test.ts (lib) e routes-catalog.test.ts.

const fx = createFixtures("RotasSolic")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let orgB: string
let researcher: string
let adminA: string
let adminB: string
let sysAdmin: string

type RequestRow = {
  id: string
  status: string
  requestedByEmail: string | null
  requestedById: string | null
  orgId: string | null
  orgName: string | null
  reviewNote: string | null
  createdItemId: string | null
}

const open = (body: unknown) => openRequest(req("/api/catalog-requests", { body }))
const queue = (query = "") => listQueue(req(`/api/catalog-requests${query}`))
const doApprove = (id: string) =>
  approve(req(`/api/catalog-requests/${id}/approve`, { method: "POST" }), ctx({ id }))
const doReject = (id: string, body?: unknown) =>
  reject(req(`/api/catalog-requests/${id}/reject`, { method: "POST", body }), ctx({ id }))

const organPayload = (label = "Órgão pedido") => {
  const n = fx.unique(label)
  return { namePt: n, nameEn: `${n} en` }
}

/**
 * Solicitação de órgão PENDENTE em nome de `userId`, gravada direto no banco: a abertura pela
 * rota tem teto de 10 por hora por usuário e é exercitada no bloco do POST.
 */
async function requested(userId: string, payload = organPayload()) {
  const row = await prisma.catalogRequest.create({
    data: {
      type: "ORGAN",
      payload,
      requestedById: userId,
      requestedByEmail: `${userId}@test.local`,
      orgId: orgA,
      orgName: "Org A",
    },
    select: { id: true },
  })
  await fx.as(userId)
  return { id: row.id, payload }
}
/** Pesquisador novo do grupo A — cada um tem a própria cota de abertura pela rota. */
const freshResearcher = () => fx.user({ memberships: [[orgA, "RESEARCHER"]] })
const asName = (p: { namePt: string; nameEn: string }) => ({ pt: p.namePt, en: p.nameEn })
const stored = (id: string) => prisma.catalogRequest.findUniqueOrThrow({ where: { id } })

beforeAll(async () => {
  orgA = await fx.org("Org A")
  orgB = await fx.org("Org B")
  researcher = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  adminA = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  adminB = await fx.user({ memberships: [[orgB, "ORG_ADMIN"]] })
  sysAdmin = await fx.user({ isSystemAdmin: true })
})

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("POST /api/catalog-requests", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await open({ type: "organs", payload: organPayload() })).status).toBe(401)
  })

  it("pesquisador abre a solicitação com o grupo ativo registrado", async () => {
    const user = await fx.as(researcher)
    const payload = organPayload()
    const res = await open({ type: "organs", payload })
    expect(res.status).toBe(201)
    const row = await json<RequestRow>(res)
    expect(row).toMatchObject({ status: "PENDING", requestedById: researcher, orgId: orgA })

    expect(await stored(row.id)).toMatchObject({
      type: "ORGAN",
      status: "PENDING",
      payload,
      requestedById: researcher,
      requestedByEmail: `${researcher}@test.local`,
      orgId: orgA,
      orgName: user.memberships[0]!.orgName,
      targetId: null,
    })
    // Pedir não cria o item.
    expect(
      await prisma.organ.count({ where: { name: { path: ["pt"], equals: payload.namePt } } }),
    ).toBe(0)
  })

  it("admin global também pede (sem grupo de contexto)", async () => {
    await fx.as(sysAdmin)
    const res = await open({ type: "systems", payload: organPayload("Sistema pedido") })
    expect(res.status).toBe(201)
    const row = await json<RequestRow>(res)
    expect(await stored(row.id)).toMatchObject({ type: "SYSTEM", orgId: null, orgName: null })
  })

  it("422 com tipo inválido, payload inválido ou patógeno sem NCBI", async () => {
    const group = (await fx.catalog()).groupId
    await fx.as(await freshResearcher())
    expect((await open({ type: "organelas", payload: organPayload() })).status).toBe(422)
    expect((await open({ type: "organs", payload: { namePt: "" } })).status).toBe(422)
    expect((await open(null)).status).toBe(422)

    const noNcbi = await open({
      type: "pathogens",
      payload: { groupId: group, scientificName: `Semtaxon ${fx.tag}` },
    })
    expect(noNcbi.status).toBe(422)
    expect((await json<{ code: string }>(noNcbi)).code).toBe(ERROR_CODES.pathogenNcbiRequired)
  })

  it("409 para solicitação pendente idêntica do mesmo autor", async () => {
    const first = await requested(researcher)
    const again = await open({
      type: "organs",
      payload: { namePt: first.payload.namePt.toUpperCase(), nameEn: "Outro nome en" },
    })
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(
      ERROR_CODES.catalogRequestDuplicatePending,
    )
    // Outro autor pode pedir o mesmo nome: a duplicata é resolvida na curadoria.
    await fx.as(adminA)
    expect((await open({ type: "organs", payload: first.payload })).status).toBe(201)
  })

  it("edição: alvo precisa existir no tipo e só cabe uma proposta pendente por item", async () => {
    const cat = await fx.catalog()
    await fx.as(await freshResearcher())
    const missing = await open({
      type: "organs",
      targetId: randomUUID(),
      payload: organPayload(),
    })
    expect(missing.status).toBe(404)
    // Id de outro catálogo também é "não encontrado".
    expect(
      (await open({ type: "systems", targetId: cat.organId, payload: organPayload() })).status,
    ).toBe(404)

    const first = await open({ type: "organs", targetId: cat.organId, payload: organPayload() })
    expect(first.status).toBe(201)
    expect(await stored((await json<RequestRow>(first)).id)).toMatchObject({
      targetId: cat.organId,
    })

    await fx.as(adminA)
    const second = await open({ type: "organs", targetId: cat.organId, payload: organPayload() })
    expect(second.status).toBe(409)
    expect((await json<{ code: string }>(second)).code).toBe(
      ERROR_CODES.catalogRequestDuplicatePending,
    )
  })

  it("429 depois de 10 solicitações na mesma hora", async () => {
    const spammer = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
    await fx.as(spammer)
    for (let i = 0; i < 10; i++) {
      expect((await open({ type: "organs", payload: organPayload(`Spam ${i}`) })).status).toBe(201)
    }
    const blocked = await open({ type: "organs", payload: organPayload("Spam 11") })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await json<{ code: string }>(blocked)).code).toBe(ERROR_CODES.rateLimited)
    expect(await prisma.catalogRequest.count({ where: { requestedById: spammer } })).toBe(10)
  })
})

describe("GET /api/catalog-requests (fila)", () => {
  it("401 sem sessão; 403 para pesquisador", async () => {
    login(null)
    expect((await queue()).status).toBe(401)
    await fx.as(researcher)
    expect((await queue()).status).toBe(403)
  })

  it("admin de grupo vê a fila sem o e-mail do solicitante; o admin global vê", async () => {
    const r = await requested(researcher)

    await fx.as(adminB)
    const asOrgAdmin = (await json<RequestRow[]>(await queue())).find((x) => x.id === r.id)
    expect(asOrgAdmin).toMatchObject({ status: "PENDING", requestedByEmail: null, orgId: orgA })

    await fx.as(sysAdmin)
    const asSys = (await json<RequestRow[]>(await queue("?status=PENDING"))).find(
      (x) => x.id === r.id,
    )
    expect(asSys).toMatchObject({ requestedByEmail: `${researcher}@test.local` })
  })

  it("filtra por status; valor inválido cai em PENDING", async () => {
    const pendingOne = await requested(researcher)
    const rejected = await requested(researcher)
    await fx.as(adminA)
    expect((await doReject(rejected.id, { note: "fora do escopo" })).status).toBe(204)

    const rejectedIds = (await json<RequestRow[]>(await queue("?status=REJECTED"))).map((x) => x.id)
    expect(rejectedIds).toContain(rejected.id)
    expect(rejectedIds).not.toContain(pendingOne.id)

    const fallback = (await json<RequestRow[]>(await queue("?status=QUALQUER"))).map((x) => x.id)
    expect(fallback).toContain(pendingOne.id)
    expect(fallback).not.toContain(rejected.id)
  })
})

describe("GET /api/catalog-requests/mine", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await listMine()).status).toBe(401)
  })

  it("devolve só as solicitações do próprio usuário, com status e motivo", async () => {
    const author = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
    const mine = await requested(author)
    const others = await requested(researcher)
    await fx.as(adminA)
    await doReject(mine.id, { note: "  já existe como sinônimo  " })

    await fx.as(author)
    const res = await listMine()
    expect(res.status).toBe(200)
    const rows = await json<RequestRow[]>(res)
    expect(rows.map((r) => r.id)).toEqual([mine.id])
    expect(rows[0]).toMatchObject({ status: "REJECTED", reviewNote: "já existe como sinônimo" })
    expect(rows.map((r) => r.id)).not.toContain(others.id)
  })
})

describe("POST /api/catalog-requests/[id]/approve", () => {
  it("401 sem sessão; 403 para pesquisador", async () => {
    const r = await requested(researcher)
    login(null)
    expect((await doApprove(r.id)).status).toBe(401)
    const other = await fx.user({ memberships: [[orgB, "RESEARCHER"]] })
    await fx.as(other)
    expect((await doApprove(r.id)).status).toBe(403)
    expect(await stored(r.id)).toMatchObject({ status: "PENDING", createdItemId: null })
  })

  it("admin de outro grupo aprova: o item nasce em nome de quem pediu", async () => {
    const r = await requested(researcher)
    await fx.as(adminB)
    const res = await doApprove(r.id)
    expect(res.status).toBe(200)
    const { createdItemId } = await json<{ createdItemId: string }>(res)

    expect(await prisma.organ.findUniqueOrThrow({ where: { id: createdItemId } })).toMatchObject({
      name: asName(r.payload),
      createdById: researcher,
    })
    const row = await stored(r.id)
    expect(row).toMatchObject({ status: "APPROVED", reviewedById: adminB, createdItemId })
    expect(row.reviewedAt).not.toBeNull()
  })

  it("admin global aprova uma proposta de edição: o item apontado é alterado", async () => {
    const cat = await fx.catalog()
    await fx.as(researcher)
    const payload = organPayload("Órgão corrigido")
    const opened = await json<RequestRow>(
      await open({ type: "organs", targetId: cat.organId, payload }),
    )

    await fx.as(sysAdmin)
    const res = await doApprove(opened.id)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ createdItemId: cat.organId })
    expect((await prisma.organ.findUniqueOrThrow({ where: { id: cat.organId } })).name).toEqual(
      asName(payload),
    )
    expect(await stored(opened.id)).toMatchObject({ status: "APPROVED", reviewedById: sysAdmin })
  })

  it("404 quando o item da proposta de edição foi excluído antes da revisão", async () => {
    const cat = await fx.catalog()
    await fx.as(researcher)
    const opened = await json<RequestRow>(
      await open({ type: "organs", targetId: cat.organId, payload: organPayload() }),
    )
    await prisma.organ.delete({ where: { id: cat.organId } })

    await fx.as(sysAdmin)
    const res = await doApprove(opened.id)
    expect(res.status).toBe(404)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogNotFound)
  })

  it("ninguém aprova a própria solicitação (403)", async () => {
    const r = await requested(adminA)
    const res = await doApprove(r.id)
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogRequestSelfReview)
    expect(await stored(r.id)).toMatchObject({ status: "PENDING" })
    expect(await prisma.organ.count({ where: { createdById: adminA } })).toBe(0)
  })

  it("409 quando já foi processada; 404 quando não existe", async () => {
    const r = await requested(researcher)
    await fx.as(adminA)
    expect((await doApprove(r.id)).status).toBe(200)
    const again = await doApprove(r.id)
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(ERROR_CODES.catalogRequestProcessed)
    expect(
      await prisma.organ.count({ where: { name: { path: ["pt"], equals: r.payload.namePt } } }),
    ).toBe(1)

    const missing = await doApprove(randomUUID())
    expect(missing.status).toBe(404)
    expect((await json<{ code: string }>(missing)).code).toBe(ERROR_CODES.catalogRequestNotFound)
  })

  it("nome que passou a existir: 409 e a solicitação é rejeitada como duplicata", async () => {
    const r = await requested(researcher)
    const existing = await prisma.organ.create({
      data: { key: `dup_${fx.tag}`, name: asName(r.payload), createdById: adminA },
      select: { id: true },
    })
    fx.tracked.organs.add(existing.id)

    await fx.as(adminB)
    const res = await doApprove(r.id)
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogDuplicate)
    expect(await stored(r.id)).toMatchObject({
      status: "REJECTED",
      reviewNote: "duplicate",
      duplicateOfId: existing.id,
      reviewedById: adminB,
    })
  })

  // BUG: a aprovação cria o item e só depois marca a solicitação com `updateMany(... status:
  // PENDING)`, sem conferir o `count`. Se outro curador rejeitar nesse intervalo, a rota
  // responde 200 com o item criado e a solicitação continua REJECTED. Deveria ser 409.
  it.fails("aprovação que perde a corrida para uma rejeição responde 409", async () => {
    const r = await requested(researcher)
    race.afterCreate = async () => {
      await prisma.catalogRequest.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: { status: "REJECTED", reviewedById: adminA, reviewedAt: new Date() },
      })
    }
    await fx.as(adminB)
    const res = await doApprove(r.id)
    expect(await stored(r.id)).toMatchObject({ status: "REJECTED" })
    expect(res.status).toBe(409)
  })
})

describe("POST /api/catalog-requests/[id]/reject", () => {
  it("401 sem sessão; 403 para pesquisador", async () => {
    const r = await requested(researcher)
    login(null)
    expect((await doReject(r.id, {})).status).toBe(401)
    const other = await fx.user({ memberships: [[orgB, "RESEARCHER"]] })
    await fx.as(other)
    expect((await doReject(r.id, {})).status).toBe(403)
    expect(await stored(r.id)).toMatchObject({ status: "PENDING" })
  })

  it("curador rejeita com motivo opcional; nenhum item é criado", async () => {
    const withNote = await requested(researcher)
    const withoutNote = await requested(researcher)
    await fx.as(adminA)

    expect((await doReject(withNote.id, { note: "  nome fora do padrão " })).status).toBe(204)
    expect(await stored(withNote.id)).toMatchObject({
      status: "REJECTED",
      reviewNote: "nome fora do padrão",
      reviewedById: adminA,
      createdItemId: null,
    })

    // Sem corpo algum: motivo nulo.
    expect((await doReject(withoutNote.id)).status).toBe(204)
    expect(await stored(withoutNote.id)).toMatchObject({ status: "REJECTED", reviewNote: null })
    expect(
      await prisma.organ.count({
        where: { name: { path: ["pt"], equals: withNote.payload.namePt } },
      }),
    ).toBe(0)
  })

  it("403 na própria solicitação; 409 já processada; 422 motivo longo; 404 inexistente", async () => {
    const own = await requested(adminA)
    const self = await doReject(own.id, {})
    expect(self.status).toBe(403)
    expect((await json<{ code: string }>(self)).code).toBe(ERROR_CODES.catalogRequestSelfReview)

    const r = await requested(researcher)
    await fx.as(sysAdmin)
    expect((await doReject(r.id, { note: "x".repeat(501) })).status).toBe(422)
    expect(await stored(r.id)).toMatchObject({ status: "PENDING" })

    expect((await doReject(r.id, {})).status).toBe(204)
    const again = await doReject(r.id, {})
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(ERROR_CODES.catalogRequestProcessed)
    expect((await doApprove(r.id)).status).toBe(409)

    expect((await doReject(randomUUID(), {})).status).toBe(404)
  })
})
