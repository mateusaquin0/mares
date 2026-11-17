import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ANONYMIZED_EMAIL, ANONYMIZED_NAME } from "@/lib/user-deletion"
import { ctx, json, login, req } from "./helpers/route"
import { fakeSupabase } from "./helpers/supabase-fake"
import { createFixtures } from "./helpers/org-fixtures"

import { GET as listJoinRequests } from "@/app/api/admin/access-requests/route"
import { POST as approveJoin } from "@/app/api/admin/access-requests/[id]/approve/route"
import { POST as rejectJoin } from "@/app/api/admin/access-requests/[id]/reject/route"
import { GET as listOrgs } from "@/app/api/admin/organizations/route"
import { POST as adminAddMember } from "@/app/api/admin/organizations/[orgId]/members/route"
import {
  PUT as adminChangeRole,
  DELETE as adminRemoveMember,
} from "@/app/api/admin/organizations/[orgId]/members/[userId]/route"
import { GET as listUsers } from "@/app/api/admin/users/route"
import { DELETE as deleteUser } from "@/app/api/admin/users/[id]/route"
import { POST as adminResend } from "@/app/api/admin/users/[id]/resend-invite/route"

// Rotas do admin global: aprovação/rejeição das solicitações de grupo, grupos e seus membros,
// usuários (listagem, reenvio de convite e exclusão com anonimização). Admin de grupo e
// pesquisador não entram aqui.

const fx = createFixtures("RotasAdmin")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let sysAdmin: string
let orgA: string
let orgAdmin: string
let researcher: string

const id = () => randomUUID()
const newEmail = (label: string) => {
  const email = `admin-${label}-${randomUUID().slice(0, 8)}@test.local`
  fx.tracked.emails.add(email)
  return email
}
/** Solicitação de grupo pendente; o nome do grupo fica registrado para a limpeza. */
async function joinRequest(email = newEmail("solicitante")) {
  const organizationName = fx.unique("Grupo aprovado")
  fx.tracked.orgNames.add(organizationName)
  const row = await prisma.joinRequest.create({
    data: { email, requesterName: "Responsável Teste", organizationName },
  })
  fx.tracked.joinRequests.add(row.id)
  return row
}
const membership = (orgId: string, userId: string) =>
  prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } })
const orgRow = (orgId: string) => prisma.organization.findUniqueOrThrow({ where: { id: orgId } })

const approve = (requestId: string) =>
  approveJoin(
    req(`/api/admin/access-requests/${requestId}/approve`, { method: "POST" }),
    ctx({ id: requestId }),
  )
const rejectReq = (requestId: string) =>
  rejectJoin(
    req(`/api/admin/access-requests/${requestId}/reject`, { method: "POST" }),
    ctx({ id: requestId }),
  )
const addMember = (orgId: string, body: unknown) =>
  adminAddMember(req(`/api/admin/organizations/${orgId}/members`, { body }), ctx({ orgId }))
const changeRole = (orgId: string, userId: string, role: unknown) =>
  adminChangeRole(
    req(`/api/admin/organizations/${orgId}/members/${userId}`, { method: "PUT", body: { role } }),
    ctx({ orgId, userId }),
  )
const removeMember = (orgId: string, userId: string) =>
  adminRemoveMember(
    req(`/api/admin/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),
    ctx({ orgId, userId }),
  )
const removeUser = (userId: string) =>
  deleteUser(req(`/api/admin/users/${userId}`, { method: "DELETE" }), ctx({ id: userId }))
const resend = (userId: string) =>
  adminResend(
    req(`/api/admin/users/${userId}/resend-invite`, { method: "POST" }),
    ctx({ id: userId }),
  )

beforeAll(async () => {
  sysAdmin = await fx.user({ isSystemAdmin: true })
  orgA = await fx.org("Org A")
  orgAdmin = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  researcher = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
})

beforeEach(() => fakeSupabase.reset())

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("/api/admin/* — só o admin global", () => {
  const routes: { name: string; call: () => Promise<Response> }[] = [
    {
      name: "GET access-requests",
      call: () => listJoinRequests(req("/api/admin/access-requests")),
    },
    { name: "POST access-requests/[id]/approve", call: () => approve(id()) },
    { name: "POST access-requests/[id]/reject", call: () => rejectReq(id()) },
    { name: "GET organizations", call: () => listOrgs() },
    {
      name: "POST organizations/[orgId]/members",
      call: () => addMember(orgA, { email: "barrado@test.local", name: "Barrado" }),
    },
    {
      name: "PUT organizations/[orgId]/members/[userId]",
      call: () => changeRole(orgA, researcher, "ORG_ADMIN"),
    },
    {
      name: "DELETE organizations/[orgId]/members/[userId]",
      call: () => removeMember(orgA, researcher),
    },
    { name: "GET users", call: () => listUsers() },
    { name: "DELETE users/[id]", call: () => removeUser(researcher) },
    { name: "POST users/[id]/resend-invite", call: () => resend(researcher) },
  ]

  it.each(routes)("$name: 401 sem sessão", async ({ call }) => {
    login(null)
    expect((await call()).status).toBe(401)
  })

  it.each(routes)("$name: 403 para admin de grupo e pesquisador", async ({ call }) => {
    for (const who of [orgAdmin, researcher]) {
      await fx.as(who)
      const res = await call()
      expect(res.status).toBe(403)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.forbidden)
    }
  })

  it("nenhuma das tentativas barradas alterou o grupo ou convidou alguém", async () => {
    expect(await membership(orgA, researcher)).toMatchObject({ role: "RESEARCHER" })
    expect(await prisma.user.count({ where: { id: researcher } })).toBe(1)
    expect(await prisma.user.count({ where: { email: "barrado@test.local" } })).toBe(0)
    expect(fakeSupabase.invites).toEqual([])
    expect(fakeSupabase.deletedUsers).toEqual([])
  })
})

describe("GET /api/admin/access-requests", () => {
  it("lista as pendentes por padrão e filtra por status", async () => {
    const pending = await joinRequest()
    const rejected = await joinRequest()
    await prisma.joinRequest.update({ where: { id: rejected.id }, data: { status: "REJECTED" } })

    await fx.as(sysAdmin)
    const res = await listJoinRequests(req("/api/admin/access-requests"))
    expect(res.status).toBe(200)
    const rows = await json<{ id: string; status: string; email: string }[]>(res)
    expect(rows.find((r) => r.id === pending.id)).toMatchObject({
      status: "PENDING",
      email: pending.email,
      organizationName: pending.organizationName,
    })
    expect(rows.map((r) => r.id)).not.toContain(rejected.id)
    expect(rows.every((r) => r.status === "PENDING")).toBe(true)

    const onlyRejected = await json<{ id: string }[]>(
      await listJoinRequests(req("/api/admin/access-requests?status=REJECTED")),
    )
    expect(onlyRejected.map((r) => r.id)).toContain(rejected.id)
    expect(onlyRejected.map((r) => r.id)).not.toContain(pending.id)

    // Valor fora do enum cai em PENDING.
    const fallback = await json<{ id: string }[]>(
      await listJoinRequests(req("/api/admin/access-requests?status=TODAS")),
    )
    expect(fallback.map((r) => r.id)).toContain(pending.id)
  })
})

describe("POST /api/admin/access-requests/[id]/approve", () => {
  it("cria o grupo, convida o responsável como administrador e fecha a solicitação", async () => {
    const jr = await joinRequest()
    await fx.as(sysAdmin)
    const res = await approve(jr.id)
    expect(res.status).toBe(200)
    const body = await json<{
      organization: { id: string; name: string }
      user: { id: string; invited: boolean }
    }>(res)
    expect(body.organization.name).toBe(jr.organizationName)
    expect(body.user.invited).toBe(true)

    expect(fakeSupabase.invites).toEqual([jr.email])
    const org = await orgRow(body.organization.id)
    expect(org).toMatchObject({ name: jr.organizationName, deactivatedAt: null })
    expect(await prisma.user.findUniqueOrThrow({ where: { email: jr.email } })).toMatchObject({
      id: body.user.id,
      name: "Responsável Teste",
      status: "INVITED",
    })
    expect(await membership(org.id, body.user.id)).toMatchObject({ role: "ORG_ADMIN" })
    const closed = await prisma.joinRequest.findUniqueOrThrow({ where: { id: jr.id } })
    expect(closed).toMatchObject({ status: "APPROVED", reviewedById: sysAdmin })
    expect(closed.reviewedAt).not.toBeNull()
  })

  it("solicitante que já tem conta vira administrador do novo grupo sem novo convite", async () => {
    const jr = await joinRequest(`${researcher}@test.local`)
    await fx.as(sysAdmin)
    const res = await approve(jr.id)
    expect(res.status).toBe(200)
    const body = await json<{
      organization: { id: string }
      user: { id: string; invited: boolean }
    }>(res)
    expect(body.user).toEqual({ id: researcher, invited: false })
    expect(fakeSupabase.invites).toEqual([])
    expect(await membership(body.organization.id, researcher)).toMatchObject({ role: "ORG_ADMIN" })
    // O vínculo anterior continua como estava.
    expect(await membership(orgA, researcher)).toMatchObject({ role: "RESEARCHER" })
  })

  it("409 para solicitação já processada; 404 para inexistente — sem novo grupo", async () => {
    const jr = await joinRequest()
    await fx.as(sysAdmin)
    expect((await approve(jr.id)).status).toBe(200)

    const again = await approve(jr.id)
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(ERROR_CODES.requestProcessed)
    expect(await prisma.organization.count({ where: { name: jr.organizationName } })).toBe(1)

    const missing = await approve(id())
    expect(missing.status).toBe(404)
    expect((await json<{ code: string }>(missing)).code).toBe(ERROR_CODES.requestNotFound)
  })

  // BUG: não há trava entre ler a solicitação PENDING e marcá-la como aprovada. Duas
  // aprovações simultâneas criam dois grupos. Deveria valer só uma (a outra, 409).
  it.fails("duas aprovações simultâneas criam um único grupo", async () => {
    const jr = await joinRequest()
    await fx.as(sysAdmin)
    const results = await Promise.all([approve(jr.id), approve(jr.id)])
    expect(await prisma.organization.count({ where: { name: jr.organizationName } })).toBe(1)
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  // BUG: o grupo é criado ANTES do convite e fora de transação. Se o convite falha, a rota
  // responde 500, a solicitação continua PENDING e sobra um grupo órfão sem membros (uma nova
  // tentativa cria outro). Deveria não restar grupo algum.
  it.fails("falha no convite não deixa grupo órfão", async () => {
    const jr = await joinRequest()
    fakeSupabase.failNext.invite = "SMTP fora do ar"
    await fx.as(sysAdmin)
    const res = await approve(jr.id)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(await prisma.joinRequest.findUniqueOrThrow({ where: { id: jr.id } })).toMatchObject({
      status: "PENDING",
    })
    expect(await prisma.organization.count({ where: { name: jr.organizationName } })).toBe(0)
  })

  // BUG (mesma causa): solicitação feita com o e-mail de um admin global é recusada com 409
  // depois de o grupo já ter sido criado.
  it.fails("solicitação com e-mail de admin global é recusada sem criar grupo", async () => {
    const other = await fx.user({ isSystemAdmin: true })
    const jr = await joinRequest(`${other}@test.local`)
    await fx.as(sysAdmin)
    const res = await approve(jr.id)
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.systemAdminNoOrg)
    expect(await prisma.organization.count({ where: { name: jr.organizationName } })).toBe(0)
  })
})

describe("POST /api/admin/access-requests/[id]/reject", () => {
  it("rejeita sem criar grupo, conta ou convite", async () => {
    const jr = await joinRequest()
    await fx.as(sysAdmin)
    const res = await rejectReq(jr.id)
    expect(res.status).toBe(200)
    const row = await prisma.joinRequest.findUniqueOrThrow({ where: { id: jr.id } })
    expect(row).toMatchObject({ status: "REJECTED", reviewedById: sysAdmin })
    expect(row.reviewedAt).not.toBeNull()
    expect(await prisma.organization.count({ where: { name: jr.organizationName } })).toBe(0)
    expect(await prisma.user.count({ where: { email: jr.email } })).toBe(0)
    expect(fakeSupabase.invites).toEqual([])
  })

  it("409 para solicitação já processada (rejeitada ou aprovada); 404 para inexistente", async () => {
    const jr = await joinRequest()
    await fx.as(sysAdmin)
    await rejectReq(jr.id)
    const again = await rejectReq(jr.id)
    expect(again.status).toBe(409)
    expect((await json<{ code: string }>(again)).code).toBe(ERROR_CODES.requestProcessed)
    // Rejeitada não pode mais ser aprovada.
    expect((await approve(jr.id)).status).toBe(409)
    expect(await prisma.organization.count({ where: { name: jr.organizationName } })).toBe(0)

    expect((await rejectReq(id())).status).toBe(404)
  })
})

describe("GET /api/admin/organizations", () => {
  it("lista os grupos com membros, contagem de pesquisas e desativação", async () => {
    const empty = await fx.org("Desativado", { deactivatedAt: new Date() })
    await fx.research(orgA, { createdById: orgAdmin })

    await fx.as(sysAdmin)
    const res = await listOrgs()
    expect(res.status).toBe(200)
    const rows = await json<
      {
        id: string
        researchCount: number
        deactivatedAt: string | null
        members: { userId: string; role: string; email: string }[]
      }[]
    >(res)
    const a = rows.find((o) => o.id === orgA)!
    expect(a.researchCount).toBe(1)
    expect(a.deactivatedAt).toBeNull()
    expect(a.members).toEqual([
      expect.objectContaining({
        userId: orgAdmin,
        role: "ORG_ADMIN",
        email: `${orgAdmin}@test.local`,
      }),
      expect.objectContaining({ userId: researcher, role: "RESEARCHER" }),
    ])
    const off = rows.find((o) => o.id === empty)!
    expect(off.members).toEqual([])
    expect(off.deactivatedAt).not.toBeNull()
  })
})

describe("POST /api/admin/organizations/[orgId]/members", () => {
  it("convida uma pessoa nova para qualquer grupo", async () => {
    const email = newEmail("novo")
    await fx.as(sysAdmin)
    const res = await addMember(orgA, { email, name: "Convidada", role: "ORG_ADMIN" })
    expect(res.status).toBe(201)
    const body = await json<{ userId: string; invited: boolean; role: string }>(res)
    expect(body).toMatchObject({ invited: true, role: "ORG_ADMIN" })
    expect(fakeSupabase.invites).toEqual([email])
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      status: "INVITED",
    })
    expect(await membership(orgA, body.userId)).toMatchObject({ role: "ORG_ADMIN" })
  })

  it("readicionar um membro reativa o grupo desativado", async () => {
    const off = await fx.org("Para reativar", { deactivatedAt: new Date() })
    const existing = await fx.user()
    await fx.as(sysAdmin)
    const res = await addMember(off, { email: `${existing}@test.local` })
    expect(res.status).toBe(201)
    expect(await json(res)).toMatchObject({
      userId: existing,
      role: "RESEARCHER",
      invited: false,
      reusedExistingUser: true,
    })
    expect(fakeSupabase.invites).toEqual([])
    expect(await membership(off, existing)).not.toBeNull()
    expect((await orgRow(off)).deactivatedAt).toBeNull()
  })

  it("409 quando já é membro ou é admin global; 422 sem nome ou e-mail inválido", async () => {
    await fx.as(sysAdmin)
    const dup = await addMember(orgA, { email: `${researcher}@test.local` })
    expect(dup.status).toBe(409)
    expect((await json<{ code: string }>(dup)).code).toBe(ERROR_CODES.alreadyMember)

    const self = await addMember(orgA, { email: `${sysAdmin}@test.local` })
    expect(self.status).toBe(409)
    expect((await json<{ code: string }>(self)).code).toBe(ERROR_CODES.systemAdminNoOrg)

    const email = newEmail("semnome")
    const noName = await addMember(orgA, { email })
    expect(noName.status).toBe(422)
    expect((await json<{ code: string }>(noName)).code).toBe(ERROR_CODES.nameRequired)
    expect((await addMember(orgA, { email: "torto", name: "Fulana" })).status).toBe(422)
    expect(fakeSupabase.invites).toEqual([])
    expect(await prisma.user.count({ where: { email } })).toBe(0)
  })

  // BUG: o grupo não é conferido antes do vínculo. Com um id inexistente a FK estoura e a
  // rota responde 500; deveria ser 404.
  it.fails("404 para grupo inexistente", async () => {
    const existing = await fx.user()
    await fx.as(sysAdmin)
    const res = await addMember(id(), { email: `${existing}@test.local` })
    expect(res.status).toBe(404)
  })
})

describe("PUT/DELETE /api/admin/organizations/[orgId]/members/[userId]", () => {
  async function group(researchers = 1) {
    const orgId = await fx.org("Grupo")
    const admin = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
    const members: string[] = []
    for (let i = 0; i < researchers; i++) {
      members.push(await fx.user({ memberships: [[orgId, "RESEARCHER"]] }))
    }
    return { orgId, admin, members }
  }

  it("altera o papel de qualquer membro, inclusive de outro administrador", async () => {
    const g = await group()
    await fx.as(sysAdmin)
    const up = await changeRole(g.orgId, g.members[0]!, "ORG_ADMIN")
    expect(up.status).toBe(200)
    expect(await json(up)).toEqual({ userId: g.members[0], role: "ORG_ADMIN" })
    expect(await membership(g.orgId, g.members[0]!)).toMatchObject({ role: "ORG_ADMIN" })

    expect((await changeRole(g.orgId, g.admin, "RESEARCHER")).status).toBe(200)
    expect(await membership(g.orgId, g.admin)).toMatchObject({ role: "RESEARCHER" })
  })

  it("PUT: 422 com papel inválido; 404 para quem não é membro", async () => {
    const g = await group()
    await fx.as(sysAdmin)
    expect((await changeRole(g.orgId, g.members[0]!, "DONO")).status).toBe(422)
    const res = await changeRole(g.orgId, researcher, "ORG_ADMIN")
    expect(res.status).toBe(404)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.memberNotFound)
  })

  it("remove um membro; a conta e o grupo permanecem", async () => {
    const g = await group()
    await fx.as(sysAdmin)
    const res = await removeMember(g.orgId, g.members[0]!)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ orgDeactivated: false })
    expect(await membership(g.orgId, g.members[0]!)).toBeNull()
    expect(await prisma.user.count({ where: { id: g.members[0]! } })).toBe(1)
    expect((await orgRow(g.orgId)).deactivatedAt).toBeNull()
  })

  it("remover o último membro desativa o grupo", async () => {
    const g = await group(0)
    await fx.research(g.orgId, { createdById: g.admin })
    await fx.as(sysAdmin)
    const res = await removeMember(g.orgId, g.admin)
    expect(await json(res)).toEqual({ orgDeactivated: true })
    expect((await orgRow(g.orgId)).deactivatedAt).not.toBeNull()
    expect(await prisma.research.count({ where: { orgId: g.orgId } })).toBe(1)
  })

  it("DELETE: 404 para quem não é membro", async () => {
    const g = await group()
    await fx.as(sysAdmin)
    const res = await removeMember(g.orgId, researcher)
    expect(res.status).toBe(404)
    expect(await membership(orgA, researcher)).not.toBeNull()
  })
})

describe("GET /api/admin/users", () => {
  it("lista os usuários com situação e vínculos", async () => {
    await fx.as(sysAdmin)
    const res = await listUsers()
    expect(res.status).toBe(200)
    const rows = await json<
      {
        id: string
        email: string
        status: string
        isSystemAdmin: boolean
        memberships: { orgId: string; orgName: string; role: string }[]
      }[]
    >(res)
    expect(rows.find((u) => u.id === researcher)).toMatchObject({
      email: `${researcher}@test.local`,
      status: "ACTIVE",
      isSystemAdmin: false,
      memberships: expect.arrayContaining([
        { orgId: orgA, orgName: (await orgRow(orgA)).name, role: "RESEARCHER" },
      ]),
    })
    expect(rows.find((u) => u.id === sysAdmin)).toMatchObject({
      isSystemAdmin: true,
      memberships: [],
    })
  })
})

describe("POST /api/admin/users/[id]/resend-invite", () => {
  it("reenvia o convite de quem ainda não ativou, mesmo sem vínculo com grupo", async () => {
    const invited = await fx.user({ status: "INVITED" })
    await fx.as(sysAdmin)
    expect((await resend(invited)).status).toBe(204)
    expect(fakeSupabase.invites).toEqual([`${invited}@test.local`])
  })

  it("409 para quem já ativou; 404 para usuário inexistente", async () => {
    await fx.as(sysAdmin)
    const active = await resend(researcher)
    expect(active.status).toBe(409)
    expect((await json<{ code: string }>(active)).code).toBe(ERROR_CODES.notInvited)
    const missing = await resend(id())
    expect(missing.status).toBe(404)
    expect((await json<{ code: string }>(missing)).code).toBe(ERROR_CODES.userNotFound)
    expect(fakeSupabase.invites).toEqual([])
  })
})

describe("DELETE /api/admin/users/[id]", () => {
  it("remove do Auth e do banco, anonimiza os rastros e preserva os registros", async () => {
    const orgId = await fx.org("Grupo do excluído")
    const keeper = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
    const target = await fx.user({ name: "Pessoa Excluída", memberships: [[orgId, "RESEARCHER"]] })
    const email = `${target}@test.local`
    const researchId = await fx.research(orgId, { createdById: target, members: [target, keeper] })

    const feedback = await prisma.feedback.create({
      data: { type: "BUG", title: "t", message: "m", createdById: target, createdByEmail: email },
    })
    fx.tracked.feedbacks.add(feedback.id)
    // Ticket de OUTRA pessoa com uma mensagem do excluído e uma de quem fica.
    const otherFeedback = await prisma.feedback.create({
      data: {
        type: "SUGGESTION",
        title: "t",
        message: "m",
        createdById: keeper,
        createdByEmail: `${keeper}@test.local`,
        messages: {
          create: [
            { body: "do excluído", party: "ADMIN", createdById: target, createdByEmail: email },
            {
              body: "de quem fica",
              party: "AUTHOR",
              createdById: keeper,
              createdByEmail: `${keeper}@test.local`,
            },
          ],
        },
      },
      include: { messages: true },
    })
    fx.tracked.feedbacks.add(otherFeedback.id)
    const catalogRequest = await prisma.catalogRequest.create({
      data: {
        type: "ORGAN",
        payload: { namePt: fx.unique("x"), nameEn: fx.unique("x") },
        requestedById: target,
        requestedByEmail: email,
      },
    })
    fx.tracked.catalogRequests.add(catalogRequest.id)
    // A solicitação de acesso não referencia o usuário por id — casa pelo e-mail, sem caixa.
    const join = await prisma.joinRequest.create({
      data: {
        email: email.toUpperCase(),
        requesterName: "Pessoa Excluída",
        organizationName: fx.unique("Grupo antigo"),
        status: "APPROVED",
      },
    })
    fx.tracked.joinRequests.add(join.id)

    await fx.as(sysAdmin)
    const res = await removeUser(target)
    expect(res.status).toBe(204)

    expect(fakeSupabase.deletedUsers).toEqual([target])
    expect(await prisma.user.count({ where: { id: target } })).toBe(0)
    expect(await prisma.membership.count({ where: { userId: target } })).toBe(0)
    expect(await prisma.researchMember.count({ where: { userId: target } })).toBe(0)

    // Registros mantidos, sem a identidade.
    expect(await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } })).toMatchObject({
      createdById: null,
      createdByEmail: ANONYMIZED_EMAIL,
      title: "t",
    })
    const messages = await prisma.feedbackMessage.findMany({
      where: { feedbackId: otherFeedback.id },
      orderBy: { body: "asc" },
    })
    expect(messages).toEqual([
      expect.objectContaining({ body: "de quem fica", createdByEmail: `${keeper}@test.local` }),
      expect.objectContaining({
        body: "do excluído",
        createdById: null,
        createdByEmail: ANONYMIZED_EMAIL,
      }),
    ])
    expect(
      await prisma.feedback.findUniqueOrThrow({ where: { id: otherFeedback.id } }),
    ).toMatchObject({ createdByEmail: `${keeper}@test.local` })
    expect(
      await prisma.catalogRequest.findUniqueOrThrow({ where: { id: catalogRequest.id } }),
    ).toMatchObject({ requestedById: null, requestedByEmail: ANONYMIZED_EMAIL, status: "PENDING" })
    expect(await prisma.joinRequest.findUniqueOrThrow({ where: { id: join.id } })).toMatchObject({
      email: ANONYMIZED_EMAIL,
      requesterName: ANONYMIZED_NAME,
      status: "APPROVED",
    })
    // O dado científico fica; a autoria vira nula.
    expect(await prisma.research.findUniqueOrThrow({ where: { id: researchId } })).toMatchObject({
      createdById: null,
      orgId,
    })
    expect(await membership(orgId, keeper)).not.toBeNull()
  })

  it("403 ao tentar excluir a si mesmo; 404 para usuário inexistente", async () => {
    await fx.as(sysAdmin)
    const self = await removeUser(sysAdmin)
    expect(self.status).toBe(403)
    expect((await json<{ code: string }>(self)).code).toBe(ERROR_CODES.deleteSelf)
    expect(await prisma.user.count({ where: { id: sysAdmin } })).toBe(1)

    const missing = await removeUser(id())
    expect(missing.status).toBe(404)
    expect(fakeSupabase.deletedUsers).toEqual([])
  })

  it("conta já ausente no Auth: o registro local é removido mesmo assim", async () => {
    const target = await fx.user()
    fakeSupabase.failNext.deleteUser = "User not found"
    await fx.as(sysAdmin)
    expect((await removeUser(target)).status).toBe(204)
    expect(await prisma.user.count({ where: { id: target } })).toBe(0)
  })

  it("outra falha do Auth interrompe a exclusão e mantém o registro local", async () => {
    const target = await fx.user()
    fakeSupabase.failNext.deleteUser = "Database error deleting user"
    await fx.as(sysAdmin)
    expect((await removeUser(target)).status).toBeGreaterThanOrEqual(500)
    expect(await prisma.user.count({ where: { id: target } })).toBe(1)
  })

  // BUG: a exclusão pelo admin global não desativa o grupo que ficou sem membros (a exclusão
  // do próprio perfil e a remoção de membro desativam). O grupo segue "ativo" e vazio.
  it.fails("excluir o único membro de um grupo desativa o grupo", async () => {
    const orgId = await fx.org("Grupo de um só")
    const only = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
    await fx.as(sysAdmin)
    expect((await removeUser(only)).status).toBe(204)
    expect(await prisma.membership.count({ where: { orgId } })).toBe(0)
    expect((await orgRow(orgId)).deactivatedAt).not.toBeNull()
  })

  // BUG: a regra do último administrador (ver DELETE /api/organizations/[orgId]/members) é
  // ignorada: o grupo com dados fica só com pesquisadores, sem ninguém para geri-lo.
  it.fails(
    "409 ao excluir o último administrador de um grupo com dados e outros membros",
    async () => {
      const orgId = await fx.org("Grupo sem sucessor")
      const lastAdmin = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
      await fx.user({ memberships: [[orgId, "RESEARCHER"]] })
      await fx.research(orgId, { createdById: lastAdmin })
      await fx.as(sysAdmin)
      const res = await removeUser(lastAdmin)
      expect(res.status).toBe(409)
      expect(await prisma.membership.count({ where: { orgId, role: "ORG_ADMIN" } })).toBe(1)
    },
  )
})
