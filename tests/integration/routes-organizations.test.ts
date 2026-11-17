import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, req } from "./helpers/route"
import { fakeSupabase } from "./helpers/supabase-fake"
import { createFixtures } from "./helpers/org-fixtures"

import { GET as getOrg, PATCH as patchOrg } from "@/app/api/organizations/[orgId]/route"
import {
  GET as listMembers,
  POST as addMember,
} from "@/app/api/organizations/[orgId]/members/route"
import {
  PUT as changeRole,
  DELETE as removeMember,
} from "@/app/api/organizations/[orgId]/members/[userId]/route"
import { POST as resend } from "@/app/api/organizations/[orgId]/members/[userId]/resend-invite/route"
import { GET as myOrgRequest, POST as requestOrg } from "@/app/api/organizations/requests/route"

// Gestão do grupo pelo próprio grupo: dados da organização, membros (convite, reenvio, papel,
// remoção e saída) e o pedido de um NOVO grupo por quem já tem conta. O admin global não
// participa de grupos e é barrado aqui — o caminho dele é /api/admin/*.

const fx = createFixtures("RotasOrg")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let orgB: string
let adminA: string
let researcherA: string
let adminB: string
let sysAdmin: string

/** Grupo próprio do teste: um admin e, se pedido, pesquisadores e mais admins. */
async function group(opts: { researchers?: number; admins?: number; withData?: boolean } = {}) {
  const orgId = await fx.org("Grupo")
  const admins: string[] = []
  for (let i = 0; i < (opts.admins ?? 1); i++) {
    admins.push(await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] }))
  }
  const researchers: string[] = []
  for (let i = 0; i < (opts.researchers ?? 0); i++) {
    researchers.push(await fx.user({ memberships: [[orgId, "RESEARCHER"]] }))
  }
  if (opts.withData) await fx.research(orgId, { createdById: admins[0] })
  return { orgId, admin: admins[0]!, admins, researchers }
}
const membership = (orgId: string, userId: string) =>
  prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } })
const inviteEmail = (label: string) => {
  const email = `convite-${label}-${randomUUID().slice(0, 8)}@test.local`
  fx.tracked.emails.add(email)
  return email
}

beforeAll(async () => {
  orgA = await fx.org("Org A")
  orgB = await fx.org("Org B")
  adminA = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  researcherA = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  adminB = await fx.user({ memberships: [[orgB, "ORG_ADMIN"]] })
  sysAdmin = await fx.user({ isSystemAdmin: true })
})

beforeEach(() => fakeSupabase.reset())

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("GET /api/organizations/[orgId]", () => {
  const get = (orgId: string) => getOrg(req(`/api/organizations/${orgId}`), ctx({ orgId }))

  it("401 sem sessão", async () => {
    login(null)
    expect((await get(orgA)).status).toBe(401)
  })

  it("qualquer membro lê os dados do grupo", async () => {
    await fx.as(researcherA)
    const res = await get(orgA)
    expect(res.status).toBe(200)
    const row = await prisma.organization.findUniqueOrThrow({ where: { id: orgA } })
    expect(await json(res)).toEqual({
      id: orgA,
      name: row.name,
      city: null,
      state: null,
      country: null,
    })
  })

  it("403 para outro grupo e para o admin global", async () => {
    for (const who of [adminB, sysAdmin]) {
      await fx.as(who)
      expect((await get(orgA)).status).toBe(403)
    }
  })
})

describe("PATCH /api/organizations/[orgId]", () => {
  const patch = (orgId: string, body: unknown) =>
    patchOrg(req(`/api/organizations/${orgId}`, { method: "PATCH", body }), ctx({ orgId }))

  it("401 sem sessão", async () => {
    login(null)
    expect((await patch(orgA, { name: "Sem sessão" })).status).toBe(401)
  })

  it("o admin edita nome e localização; campo vazio vira nulo", async () => {
    const g = await group()
    await fx.as(g.admin)
    const name = fx.unique("Renomeado")
    fx.tracked.orgNames.add(name)
    const res = await patch(g.orgId, {
      name: ` ${name} `,
      city: " Santos ",
      state: "SP",
      country: "",
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({
      id: g.orgId,
      name,
      city: "Santos",
      state: "SP",
      country: null,
    })
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: g.orgId } })).toMatchObject({
      name,
      city: "Santos",
      state: "SP",
      country: null,
    })
  })

  it("403 para pesquisador, admin de outro grupo e admin global", async () => {
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: orgA } })
    for (const who of [researcherA, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await patch(orgA, { name: "Tomado de assalto" })).status).toBe(403)
    }
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgA } })).name).toBe(
      before.name,
    )
  })

  it("422 com nome curto ou ausente", async () => {
    await fx.as(adminA)
    expect((await patch(orgA, { name: "ab" })).status).toBe(422)
    expect((await patch(orgA, { city: "Santos" })).status).toBe(422)
  })
})

describe("GET /api/organizations/[orgId]/members", () => {
  const list = (orgId: string) =>
    listMembers(req(`/api/organizations/${orgId}/members`), ctx({ orgId }))

  it("401 sem sessão", async () => {
    login(null)
    expect((await list(orgA)).status).toBe(401)
  })

  it("qualquer membro lista os membros com papel e situação", async () => {
    await fx.as(researcherA)
    const res = await list(orgA)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([
      expect.objectContaining({
        userId: adminA,
        email: `${adminA}@test.local`,
        status: "ACTIVE",
        role: "ORG_ADMIN",
      }),
      expect.objectContaining({ userId: researcherA, role: "RESEARCHER" }),
    ])
  })

  it("403 para outro grupo e para o admin global", async () => {
    for (const who of [adminB, sysAdmin]) {
      await fx.as(who)
      expect((await list(orgA)).status).toBe(403)
    }
  })
})

describe("POST /api/organizations/[orgId]/members", () => {
  const add = (orgId: string, body: unknown) =>
    addMember(req(`/api/organizations/${orgId}/members`, { body }), ctx({ orgId }))

  it("401 sem sessão", async () => {
    login(null)
    expect((await add(orgA, { email: inviteEmail("a"), name: "Nova Pessoa" })).status).toBe(401)
    expect(fakeSupabase.invites).toEqual([])
  })

  it("e-mail novo: convida, cria o usuário INVITED e o vínculo de pesquisador", async () => {
    const email = inviteEmail("novo")
    await fx.as(adminA)
    const res = await add(orgA, { email: email.toUpperCase(), name: "  Nova Pessoa " })
    expect(res.status).toBe(201)
    const body = await json<{ userId: string; role: string; invited: boolean }>(res)
    expect(body).toMatchObject({ role: "RESEARCHER", invited: true, reusedExistingUser: false })

    expect(fakeSupabase.invites).toEqual([email])
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      id: body.userId,
      name: "Nova Pessoa",
      status: "INVITED",
      isSystemAdmin: false,
    })
    expect(await membership(orgA, body.userId)).toMatchObject({ role: "RESEARCHER" })
  })

  it("convida já como administrador quando o papel é informado", async () => {
    const email = inviteEmail("admin")
    await fx.as(adminA)
    const res = await add(orgA, { email, name: "Nova Admin", role: "ORG_ADMIN" })
    expect(res.status).toBe(201)
    const body = await json<{ userId: string }>(res)
    expect(await membership(orgA, body.userId)).toMatchObject({ role: "ORG_ADMIN" })
  })

  it("e-mail de quem já tem conta: só cria o vínculo, sem convite", async () => {
    const existing = await fx.user({ name: "Já Cadastrada" })
    await fx.as(adminA)
    const res = await add(orgA, { email: `${existing}@test.local` })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({
      userId: existing,
      role: "RESEARCHER",
      invited: false,
      reusedExistingUser: true,
    })
    expect(fakeSupabase.invites).toEqual([])
    expect(await membership(orgA, existing)).not.toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: existing } })).name).toBe(
      "Já Cadastrada",
    )
  })

  it("409 quando já é membro e quando o e-mail é de um admin global", async () => {
    await fx.as(adminA)
    const dup = await add(orgA, { email: `${researcherA}@test.local` })
    expect(dup.status).toBe(409)
    expect((await json<{ code: string }>(dup)).code).toBe(ERROR_CODES.alreadyMember)
    expect(await prisma.membership.count({ where: { orgId: orgA, userId: researcherA } })).toBe(1)

    const sys = await add(orgA, { email: `${sysAdmin}@test.local` })
    expect(sys.status).toBe(409)
    expect((await json<{ code: string }>(sys)).code).toBe(ERROR_CODES.systemAdminNoOrg)
    expect(await membership(orgA, sysAdmin)).toBeNull()
    expect(fakeSupabase.invites).toEqual([])
  })

  it("422 para e-mail novo sem nome e para e-mail inválido — nada é convidado", async () => {
    const email = inviteEmail("semnome")
    await fx.as(adminA)
    const noName = await add(orgA, { email })
    expect(noName.status).toBe(422)
    expect((await json<{ code: string }>(noName)).code).toBe(ERROR_CODES.nameRequired)
    expect((await add(orgA, { email: "nao-e-email", name: "Fulana" })).status).toBe(422)
    expect((await add(orgA, { email, name: "Fulana", role: "DONO" })).status).toBe(422)

    expect(fakeSupabase.invites).toEqual([])
    expect(await prisma.user.count({ where: { email } })).toBe(0)
  })

  it("403 para pesquisador, admin de outro grupo e admin global", async () => {
    const email = inviteEmail("negado")
    for (const who of [researcherA, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await add(orgA, { email, name: "Barrada" })).status).toBe(403)
    }
    expect(fakeSupabase.invites).toEqual([])
    expect(await prisma.user.count({ where: { email } })).toBe(0)
  })

  it("falha no envio do convite não deixa usuário nem vínculo para trás", async () => {
    const email = inviteEmail("falha")
    fakeSupabase.failNext.invite = "SMTP fora do ar"
    await fx.as(adminA)
    const res = await add(orgA, { email, name: "Sem Convite" })
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(await prisma.user.count({ where: { email } })).toBe(0)
    expect(fakeSupabase.invites).toEqual([])
  })
})

describe("POST /api/organizations/[orgId]/members/[userId]/resend-invite", () => {
  const send = (orgId: string, userId: string) =>
    resend(
      req(`/api/organizations/${orgId}/members/${userId}/resend-invite`, { method: "POST" }),
      ctx({ orgId, userId }),
    )
  let invited: string

  beforeAll(async () => {
    invited = await fx.user({ status: "INVITED", memberships: [[orgA, "RESEARCHER"]] })
  })

  it("401 sem sessão; 403 para pesquisador, outro grupo e admin global", async () => {
    login(null)
    expect((await send(orgA, invited)).status).toBe(401)
    for (const who of [researcherA, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await send(orgA, invited)).status).toBe(403)
    }
    expect(fakeSupabase.invites).toEqual([])
  })

  it("o admin reenvia o convite de quem ainda não ativou a conta", async () => {
    await fx.as(adminA)
    expect((await send(orgA, invited)).status).toBe(204)
    expect(fakeSupabase.invites).toEqual([`${invited}@test.local`])
  })

  it("409 para quem já ativou; 404 para quem não é membro do grupo", async () => {
    await fx.as(adminA)
    const active = await send(orgA, researcherA)
    expect(active.status).toBe(409)
    expect((await json<{ code: string }>(active)).code).toBe(ERROR_CODES.notInvited)

    const stranger = await send(orgA, adminB)
    expect(stranger.status).toBe(404)
    expect((await json<{ code: string }>(stranger)).code).toBe(ERROR_CODES.memberNotFound)
    expect(fakeSupabase.invites).toEqual([])
  })
})

describe("PUT /api/organizations/[orgId]/members/[userId]", () => {
  const put = (orgId: string, userId: string, role: unknown) =>
    changeRole(
      req(`/api/organizations/${orgId}/members/${userId}`, { method: "PUT", body: { role } }),
      ctx({ orgId, userId }),
    )

  it("401 sem sessão", async () => {
    login(null)
    expect((await put(orgA, researcherA, "ORG_ADMIN")).status).toBe(401)
  })

  it("o admin promove um pesquisador a administrador", async () => {
    const g = await group({ researchers: 1 })
    await fx.as(g.admin)
    const res = await put(g.orgId, g.researchers[0]!, "ORG_ADMIN")
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ userId: g.researchers[0], role: "ORG_ADMIN" })
    expect(await membership(g.orgId, g.researchers[0]!)).toMatchObject({ role: "ORG_ADMIN" })
  })

  it("o admin não altera o papel de OUTRO administrador", async () => {
    const g = await group({ admins: 2 })
    await fx.as(g.admins[0]!)
    const res = await put(g.orgId, g.admins[1]!, "RESEARCHER")
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.changeOtherAdmin)
    expect(await membership(g.orgId, g.admins[1]!)).toMatchObject({ role: "ORG_ADMIN" })
  })

  it("o admin se rebaixa quando há outro administrador", async () => {
    const g = await group({ admins: 2 })
    await fx.as(g.admins[0]!)
    expect((await put(g.orgId, g.admins[0]!, "RESEARCHER")).status).toBe(200)
    expect(await membership(g.orgId, g.admins[0]!)).toMatchObject({ role: "RESEARCHER" })
  })

  it("409: o único administrador não se rebaixa", async () => {
    const g = await group({ researchers: 1 })
    await fx.as(g.admin)
    const res = await put(g.orgId, g.admin, "RESEARCHER")
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.lastAdminDemote)
    expect(await membership(g.orgId, g.admin)).toMatchObject({ role: "ORG_ADMIN" })
  })

  it("403 para pesquisador (inclusive se promovendo), outro grupo e admin global", async () => {
    for (const who of [researcherA, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await put(orgA, researcherA, "ORG_ADMIN")).status).toBe(403)
    }
    expect(await membership(orgA, researcherA)).toMatchObject({ role: "RESEARCHER" })
  })

  it("422 com papel inválido; 404 para quem não é membro", async () => {
    await fx.as(adminA)
    expect((await put(orgA, researcherA, "DONO")).status).toBe(422)
    const res = await put(orgA, adminB, "RESEARCHER")
    expect(res.status).toBe(404)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.memberNotFound)
  })
})

describe("DELETE /api/organizations/[orgId]/members/[userId]", () => {
  const del = (orgId: string, userId: string) =>
    removeMember(
      req(`/api/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),
      ctx({ orgId, userId }),
    )
  const deactivatedAt = async (orgId: string) =>
    (await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).deactivatedAt

  it("401 sem sessão", async () => {
    login(null)
    expect((await del(orgA, researcherA)).status).toBe(401)
  })

  it("o admin remove um pesquisador: o vínculo cai, a conta e o grupo ficam", async () => {
    const g = await group({ researchers: 1 })
    await fx.as(g.admin)
    const res = await del(g.orgId, g.researchers[0]!)
    expect(res.status).toBe(204)
    expect(await membership(g.orgId, g.researchers[0]!)).toBeNull()
    expect(await prisma.user.count({ where: { id: g.researchers[0]! } })).toBe(1)
    expect(await deactivatedAt(g.orgId)).toBeNull()
  })

  it("o admin não remove outro administrador", async () => {
    const g = await group({ admins: 2 })
    await fx.as(g.admins[0]!)
    const res = await del(g.orgId, g.admins[1]!)
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.removeOtherAdmin)
    expect(await membership(g.orgId, g.admins[1]!)).not.toBeNull()
  })

  it("pesquisador não remove outro membro, mas sai por conta própria", async () => {
    const g = await group({ researchers: 2 })
    const [first, second] = g.researchers as [string, string]
    await fx.as(first)
    expect((await del(g.orgId, second)).status).toBe(403)
    expect(await membership(g.orgId, second)).not.toBeNull()

    expect((await del(g.orgId, first)).status).toBe(204)
    expect(await membership(g.orgId, first)).toBeNull()
    expect(await deactivatedAt(g.orgId)).toBeNull()
  })

  it("403 para admin de outro grupo e para o admin global", async () => {
    for (const who of [adminB, sysAdmin]) {
      await fx.as(who)
      expect((await del(orgA, researcherA)).status).toBe(403)
    }
    expect(await membership(orgA, researcherA)).not.toBeNull()
  })

  it("um administrador sai quando há outro para ficar", async () => {
    const g = await group({ admins: 2, withData: true })
    await fx.as(g.admins[0]!)
    expect((await del(g.orgId, g.admins[0]!)).status).toBe(204)
    expect(await membership(g.orgId, g.admins[0]!)).toBeNull()
    expect(await deactivatedAt(g.orgId)).toBeNull()
  })

  it("409: o último administrador não sai de um grupo com dados e outros membros", async () => {
    const g = await group({ researchers: 1, withData: true })
    await fx.as(g.admin)
    const res = await del(g.orgId, g.admin)
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.lastAdminHasData)
    expect(await membership(g.orgId, g.admin)).not.toBeNull()
  })

  it("o último membro sai: o grupo é desativado, não excluído, e os dados ficam", async () => {
    const g = await group({ withData: true })
    await fx.as(g.admin)
    const res = await del(g.orgId, g.admin)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ orgDeactivated: true })
    expect(await membership(g.orgId, g.admin)).toBeNull()
    expect(await deactivatedAt(g.orgId)).not.toBeNull()
    expect(await prisma.research.count({ where: { orgId: g.orgId } })).toBe(1)
  })

  it("404 ao remover quem não é membro e ao sair de um grupo a que não pertence", async () => {
    await fx.as(adminA)
    const stranger = await del(orgA, adminB)
    expect(stranger.status).toBe(404)
    expect((await json<{ code: string }>(stranger)).code).toBe(ERROR_CODES.memberNotFound)

    const self = await del(orgB, adminA)
    expect(self.status).toBe(404)
    expect((await json<{ code: string }>(self)).code).toBe(ERROR_CODES.notMember)
  })
})

describe("/api/organizations/requests — novo grupo por quem já tem conta", () => {
  const post = (body: unknown) => requestOrg(req("/api/organizations/requests", { body }))
  const pendingOf = (userId: string) =>
    prisma.joinRequest.findMany({ where: { email: `${userId}@test.local` } })

  it("401 sem sessão (GET e POST)", async () => {
    login(null)
    expect((await myOrgRequest()).status).toBe(401)
    expect((await post({ organizationName: "Grupo sem sessão" })).status).toBe(401)
  })

  it("abre a solicitação com o solicitante vindo da SESSÃO e a devolve no GET", async () => {
    const user = await fx.user({ name: "  Solicitante  ", memberships: [[orgA, "RESEARCHER"]] })
    await fx.as(user)
    expect(await json(await myOrgRequest())).toEqual({ pending: null })

    const organizationName = fx.unique("Novo grupo")
    const res = await post({
      organizationName: ` ${organizationName} `,
      // Campos de identidade no corpo são ignorados: ninguém pede em nome de outra pessoa.
      email: `${adminB}@test.local`,
      requesterName: "Outra Pessoa",
    })
    expect(res.status).toBe(201)
    const created = await json<{ id: string; organizationName: string }>(res)
    expect(created.organizationName).toBe(organizationName)

    const rows = await pendingOf(user)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: created.id,
      email: `${user}@test.local`,
      requesterName: "Solicitante",
      organizationName,
      status: "PENDING",
    })
    expect(await pendingOf(adminB)).toEqual([])

    const mine = await json<{ pending: { id: string; organizationName: string } }>(
      await myOrgRequest(),
    )
    expect(mine.pending).toMatchObject({ id: created.id, organizationName })
  })

  it("sem nome no cadastro, o e-mail identifica quem pediu", async () => {
    const user = await fx.user({ name: null })
    await fx.as(user)
    expect((await post({ organizationName: fx.unique("Grupo sem nome") })).status).toBe(201)
    expect((await pendingOf(user))[0]).toMatchObject({ requesterName: `${user}@test.local` })
  })

  it("409 com uma solicitação já em aberto; liberado depois da decisão", async () => {
    const user = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
    await fx.as(user)
    expect((await post({ organizationName: fx.unique("Primeiro") })).status).toBe(201)
    const again = await post({ organizationName: fx.unique("Segundo") })
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(ERROR_CODES.joinRequestPending)
    expect(await pendingOf(user)).toHaveLength(1)

    await prisma.joinRequest.updateMany({
      where: { email: `${user}@test.local` },
      data: { status: "REJECTED" },
    })
    expect(await json(await myOrgRequest())).toEqual({ pending: null })
    expect((await post({ organizationName: fx.unique("Terceiro") })).status).toBe(201)
    expect(await pendingOf(user)).toHaveLength(2)
  })

  it("403 para o admin global; 422 com nome curto", async () => {
    await fx.as(sysAdmin)
    const res = await post({ organizationName: fx.unique("Grupo do admin") })
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.systemAdminNoOrg)
    expect(await pendingOf(sysAdmin)).toEqual([])

    await fx.as(researcherA)
    expect((await post({ organizationName: "ab" })).status).toBe(422)
    expect((await post(null)).status).toBe(422)
    expect(await pendingOf(researcherA)).toEqual([])
  })

  it("429 depois de 5 tentativas na mesma hora", async () => {
    const user = await fx.user()
    await fx.as(user)
    for (let i = 0; i < 5; i++) {
      expect((await post({ organizationName: "ab" })).status).toBe(422)
    }
    const blocked = await post({ organizationName: fx.unique("Bloqueado") })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await pendingOf(user)).toEqual([])
  })
})
