import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, req } from "./helpers/route"
import { createFixtures } from "./helpers/org-fixtures"

import { GET as listMembers, POST as addMember } from "@/app/api/research/[id]/members/route"
import { DELETE as removeMember } from "@/app/api/research/[id]/members/[userId]/route"
import { POST as requestAccess } from "@/app/api/research/[id]/access-requests/route"
import { GET as listAccessRequests } from "@/app/api/research-access-requests/route"
import { PATCH as reviewAccessRequest } from "@/app/api/research-access-requests/[requestId]/route"

// Vínculo com a pesquisa (ResearchMember) e a ponte até ele: o pedido de acesso. Quem gere é
// o admin do grupo ou o criador — e o criador só enquanto ainda integra a pesquisa.

const fx = createFixtures("RotasMembros")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let orgB: string
let adminA: string
let creator: string
let linked: string
let outsider: string
let candidate: string
let adminB: string
let sysAdmin: string
let main: string

const withId = (id: string) => ctx({ id })
const newResearch = (members: string[] = [creator, linked]) =>
  fx.research(orgA, { createdById: creator, members })
const isMember = async (researchId: string, userId: string) =>
  (await prisma.researchMember.count({ where: { researchId, userId } })) === 1

beforeAll(async () => {
  orgA = await fx.org("Org A")
  orgB = await fx.org("Org B")
  adminA = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  creator = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  linked = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  outsider = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  candidate = await fx.user({ status: "INVITED", memberships: [[orgA, "RESEARCHER"]] })
  adminB = await fx.user({ memberships: [[orgB, "ORG_ADMIN"]] })
  sysAdmin = await fx.user({ isSystemAdmin: true })
  main = await newResearch()
})

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("GET /api/research/[id]/members", () => {
  const list = (id: string) => listMembers(req(`/api/research/${id}/members`), withId(id))

  it("401 sem sessão", async () => {
    login(null)
    expect((await list(main)).status).toBe(401)
  })

  it("membro lista os vínculos; só quem gere recebe canManage", async () => {
    await fx.as(linked)
    const res = await list(main)
    expect(res.status).toBe(200)
    const body = await json<{
      canManage: boolean
      createdById: string
      members: { userId: string; email: string; status: string; isCreator: boolean }[]
    }>(res)
    expect(body.canManage).toBe(false)
    expect(body.createdById).toBe(creator)
    expect(body.members).toEqual([
      expect.objectContaining({
        userId: creator,
        email: `${creator}@test.local`,
        status: "ACTIVE",
        isCreator: true,
      }),
      expect.objectContaining({ userId: linked, isCreator: false }),
    ])

    await fx.as(creator)
    expect((await json<{ canManage: boolean }>(await list(main))).canManage).toBe(true)
    await fx.as(adminA)
    expect((await json<{ canManage: boolean }>(await list(main))).canManage).toBe(true)
  })

  it("403 para pesquisador sem vínculo, outro grupo e admin global; 404 inexistente", async () => {
    for (const who of [outsider, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await list(main)).status).toBe(403)
    }
    await fx.as(adminA)
    expect((await list(randomUUID())).status).toBe(404)
  })
})

describe("POST /api/research/[id]/members", () => {
  const add = (id: string, userId: unknown) =>
    addMember(req(`/api/research/${id}/members`, { body: { userId } }), withId(id))

  it("401 sem sessão", async () => {
    login(null)
    expect((await add(main, candidate)).status).toBe(401)
  })

  it("o criador vincula um membro do grupo", async () => {
    const id = await newResearch()
    await fx.as(creator)
    const res = await add(id, candidate)
    expect(res.status).toBe(201)
    expect(await isMember(id, candidate)).toBe(true)
  })

  it("o admin do grupo vincula mesmo sem ser membro da pesquisa", async () => {
    const id = await newResearch()
    await fx.as(adminA)
    expect((await add(id, candidate)).status).toBe(201)
    expect(await isMember(id, candidate)).toBe(true)
  })

  it("membro que não é o criador não gere vínculos (403)", async () => {
    await fx.as(linked)
    const res = await add(main, candidate)
    expect(res.status).toBe(403)
    expect(await isMember(main, candidate)).toBe(false)
  })

  it("o criador REMOVIDO da pesquisa não se revincula nem vincula outros", async () => {
    const id = await newResearch([linked])
    await fx.as(creator)
    expect((await add(id, creator)).status).toBe(403)
    expect((await add(id, candidate)).status).toBe(403)
    expect(await isMember(id, creator)).toBe(false)
    expect(await isMember(id, candidate)).toBe(false)
  })

  it("403 para pesquisador sem vínculo, outro grupo e admin global", async () => {
    for (const who of [outsider, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await add(main, candidate)).status).toBe(403)
    }
    expect(await isMember(main, candidate)).toBe(false)
  })

  it("403 quando o candidato não pertence ao grupo da pesquisa", async () => {
    await fx.as(creator)
    const res = await add(main, adminB)
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.researchMemberNotResearcher)
    expect(await isMember(main, adminB)).toBe(false)
  })

  it("409 quando já é membro; 422 sem userId; 404 pesquisa inexistente", async () => {
    await fx.as(creator)
    const dup = await add(main, linked)
    expect(dup.status).toBe(409)
    expect((await json<{ code: string }>(dup)).code).toBe(ERROR_CODES.researchMemberExists)
    expect(await prisma.researchMember.count({ where: { researchId: main, userId: linked } })).toBe(
      1,
    )

    expect((await add(main, "")).status).toBe(422)
    expect((await add(randomUUID(), candidate)).status).toBe(404)
  })
})

describe("DELETE /api/research/[id]/members/[userId]", () => {
  const remove = (id: string, userId: string) =>
    removeMember(
      req(`/api/research/${id}/members/${userId}`, { method: "DELETE" }),
      ctx({ id, userId }),
    )

  it("401 sem sessão", async () => {
    login(null)
    expect((await remove(main, linked)).status).toBe(401)
  })

  it("o criador remove um membro; os dados da pesquisa ficam", async () => {
    const id = await newResearch()
    await fx.as(creator)
    expect((await remove(id, linked)).status).toBe(204)
    expect(await isMember(id, linked)).toBe(false)
    expect(await prisma.research.count({ where: { id } })).toBe(1)
  })

  it("o admin do grupo remove inclusive o criador", async () => {
    const id = await newResearch()
    await fx.as(adminA)
    expect((await remove(id, creator)).status).toBe(204)
    expect(await isMember(id, creator)).toBe(false)
  })

  it("qualquer membro sai por conta própria", async () => {
    const id = await newResearch()
    await fx.as(linked)
    expect((await remove(id, linked)).status).toBe(204)
    expect(await isMember(id, linked)).toBe(false)
  })

  it("membro comum não remove outro membro (403)", async () => {
    await fx.as(linked)
    expect((await remove(main, creator)).status).toBe(403)
    expect(await isMember(main, creator)).toBe(true)
  })

  it("o criador removido da pesquisa não remove mais ninguém", async () => {
    const id = await newResearch([linked])
    await fx.as(creator)
    expect((await remove(id, linked)).status).toBe(403)
    expect(await isMember(id, linked)).toBe(true)
  })

  it("403 para pesquisador sem vínculo, outro grupo e admin global", async () => {
    for (const who of [outsider, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await remove(main, linked)).status).toBe(403)
    }
    expect(await isMember(main, linked)).toBe(true)
  })

  it("404 quando o vínculo ou a pesquisa não existem", async () => {
    await fx.as(creator)
    const res = await remove(main, outsider)
    expect(res.status).toBe(404)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.researchMemberNotFound)
    // Sair de uma pesquisa da qual não participa também é "vínculo não encontrado".
    await fx.as(outsider)
    expect((await remove(main, outsider)).status).toBe(404)
    await fx.as(adminA)
    expect((await remove(randomUUID(), linked)).status).toBe(404)
  })
})

describe("POST /api/research/[id]/access-requests", () => {
  const ask = (id: string, body?: unknown) =>
    requestAccess(req(`/api/research/${id}/access-requests`, { method: "POST", body }), withId(id))
  const pedido = (researchId: string, userId: string) =>
    prisma.researchAccessRequest.findUnique({
      where: { researchId_userId: { researchId, userId } },
    })

  it("401 sem sessão", async () => {
    login(null)
    expect((await ask(main, {})).status).toBe(401)
  })

  it("pesquisador do grupo pede acesso, com ou sem justificativa", async () => {
    const id = await newResearch()
    await fx.as(outsider)
    const res = await ask(id, { message: "  Trabalho com a mesma espécie  " })
    expect(res.status).toBe(201)
    expect(await pedido(id, outsider)).toMatchObject({
      status: "PENDING",
      message: "Trabalho com a mesma espécie",
      reviewedById: null,
    })
    // Pedir acesso não concede acesso.
    expect(await isMember(id, outsider)).toBe(false)

    const other = await newResearch()
    expect((await ask(other)).status).toBe(201)
    expect(await pedido(other, outsider)).toMatchObject({ status: "PENDING", message: null })
  })

  it("409 quando já há pedido pendente ou quando já é membro", async () => {
    const id = await newResearch()
    await fx.as(outsider)
    expect((await ask(id, {})).status).toBe(201)
    const again = await ask(id, {})
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(
      ERROR_CODES.researchAccessRequestPending,
    )
    expect(await prisma.researchAccessRequest.count({ where: { researchId: id } })).toBe(1)

    await fx.as(linked)
    const member = await ask(id, {})
    expect(member.status).toBe(409)
    expect((await json<{ code: string }>(member)).code).toBe(
      ERROR_CODES.researchAccessAlreadyMember,
    )
  })

  it("pedir de novo depois de uma recusa reabre o MESMO pedido", async () => {
    const id = await newResearch()
    const first = await prisma.researchAccessRequest.create({
      data: {
        researchId: id,
        userId: outsider,
        status: "REJECTED",
        reviewedById: creator,
        reviewedAt: new Date(),
      },
    })
    await fx.as(outsider)
    expect((await ask(id, { message: "insisto" })).status).toBe(201)
    const row = await pedido(id, outsider)
    expect(row).toMatchObject({
      id: first.id,
      status: "PENDING",
      message: "insisto",
      reviewedById: null,
      reviewedAt: null,
    })
  })

  it("403 para outro grupo e para o admin global; 404 inexistente; 422 texto longo", async () => {
    for (const who of [adminB, sysAdmin]) {
      await fx.as(who)
      expect((await ask(main, {})).status).toBe(403)
      expect(await pedido(main, who)).toBeNull()
    }
    await fx.as(outsider)
    expect((await ask(randomUUID(), {})).status).toBe(404)
    expect((await ask(main, { message: "x".repeat(501) })).status).toBe(422)
    expect(await pedido(main, outsider)).toBeNull()
  })
})

describe("GET /api/research-access-requests", () => {
  let mine: string
  let others: string
  let requestMine: string
  let requestOthers: string

  beforeAll(async () => {
    mine = await newResearch([creator])
    // Pesquisa criada pelo admin: o `creator` não a gere.
    others = await fx.research(orgA, { createdById: adminA, members: [creator] })
    requestMine = (
      await prisma.researchAccessRequest.create({
        data: { researchId: mine, userId: outsider, message: "quero ver" },
      })
    ).id
    requestOthers = (
      await prisma.researchAccessRequest.create({ data: { researchId: others, userId: outsider } })
    ).id
  })

  it("401 sem sessão", async () => {
    login(null)
    expect((await listAccessRequests()).status).toBe(401)
  })

  it("o criador vê só os pedidos das pesquisas que gere", async () => {
    await fx.as(creator)
    const res = await listAccessRequests()
    expect(res.status).toBe(200)
    const rows =
      await json<
        { id: string; message: string | null; research: { id: string }; user: { id: string } }[]
      >(res)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(requestMine)
    expect(ids).not.toContain(requestOthers)
    expect(rows.find((r) => r.id === requestMine)).toMatchObject({
      message: "quero ver",
      research: { id: mine },
      user: { id: outsider, email: `${outsider}@test.local` },
    })
  })

  it("o admin do grupo vê os de todas as pesquisas do grupo", async () => {
    await fx.as(adminA)
    const ids = (await json<{ id: string }[]>(await listAccessRequests())).map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining([requestMine, requestOthers]))
  })

  it("quem não gere nada, outro grupo e o admin global não veem os pedidos", async () => {
    for (const who of [outsider, linked, adminB, sysAdmin]) {
      await fx.as(who)
      const res = await listAccessRequests()
      expect(res.status).toBe(200)
      const ids = (await json<{ id: string }[]>(res)).map((r) => r.id)
      expect(ids).not.toContain(requestMine)
      expect(ids).not.toContain(requestOthers)
    }
  })

  it("o criador removido da pesquisa deixa de ver os pedidos dela", async () => {
    await prisma.researchMember.delete({
      where: { researchId_userId: { researchId: mine, userId: creator } },
    })
    try {
      await fx.as(creator)
      const ids = (await json<{ id: string }[]>(await listAccessRequests())).map((r) => r.id)
      expect(ids).not.toContain(requestMine)
    } finally {
      await prisma.researchMember.create({ data: { researchId: mine, userId: creator } })
    }
  })
})

describe("PATCH /api/research-access-requests/[requestId]", () => {
  const review = (requestId: string, body: unknown) =>
    reviewAccessRequest(
      req(`/api/research-access-requests/${requestId}`, { method: "PATCH", body }),
      ctx({ requestId }),
    )

  async function pending(members: string[] = [creator, linked]) {
    const researchId = await newResearch(members)
    const { id } = await prisma.researchAccessRequest.create({
      data: { researchId, userId: outsider },
    })
    return { researchId, id }
  }
  const row = (id: string) => prisma.researchAccessRequest.findUniqueOrThrow({ where: { id } })

  it("401 sem sessão", async () => {
    const p = await pending()
    login(null)
    expect((await review(p.id, { action: "approve" })).status).toBe(401)
  })

  it("o criador aprova: o vínculo é criado e a decisão fica registrada", async () => {
    const p = await pending()
    await fx.as(creator)
    expect((await review(p.id, { action: "approve" })).status).toBe(204)
    expect(await isMember(p.researchId, outsider)).toBe(true)
    const r = await row(p.id)
    expect(r).toMatchObject({ status: "APPROVED", reviewedById: creator })
    expect(r.reviewedAt).not.toBeNull()
  })

  it("o admin do grupo recusa: nenhum vínculo é criado", async () => {
    const p = await pending()
    await fx.as(adminA)
    expect((await review(p.id, { action: "reject" })).status).toBe(204)
    expect(await isMember(p.researchId, outsider)).toBe(false)
    expect(await row(p.id)).toMatchObject({ status: "REJECTED", reviewedById: adminA })
  })

  it("409 quando o pedido já foi respondido", async () => {
    const p = await pending()
    await fx.as(adminA)
    await review(p.id, { action: "reject" })
    for (const action of ["approve", "reject"]) {
      const res = await review(p.id, { action })
      expect(res.status).toBe(409)
      expect((await json<{ code: string }>(res)).code).toBe(
        ERROR_CODES.researchAccessRequestProcessed,
      )
    }
    expect(await isMember(p.researchId, outsider)).toBe(false)
  })

  it("membro comum, o próprio solicitante, outro grupo e admin global não decidem (403)", async () => {
    const p = await pending()
    for (const who of [linked, outsider, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await review(p.id, { action: "approve" })).status).toBe(403)
    }
    expect(await row(p.id)).toMatchObject({ status: "PENDING" })
    expect(await isMember(p.researchId, outsider)).toBe(false)
  })

  it("o criador REMOVIDO da pesquisa não aprova pedidos", async () => {
    const p = await pending([linked])
    await fx.as(creator)
    expect((await review(p.id, { action: "approve" })).status).toBe(403)
    expect(await row(p.id)).toMatchObject({ status: "PENDING" })
    expect(await isMember(p.researchId, outsider)).toBe(false)
  })

  it("422 com ação inválida; 404 para pedido inexistente", async () => {
    const p = await pending()
    await fx.as(creator)
    expect((await review(p.id, { action: "talvez" })).status).toBe(422)
    expect(await row(p.id)).toMatchObject({ status: "PENDING" })
    const missing = await review(randomUUID(), { action: "approve" })
    expect(missing.status).toBe(404)
    expect((await json<{ code: string }>(missing)).code).toBe(
      ERROR_CODES.researchAccessRequestNotFound,
    )
  })
})
