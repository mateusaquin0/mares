import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { ANONYMIZED_EMAIL, ANONYMIZED_NAME } from "@/lib/user-deletion"
import { fakeSupabase } from "./helpers/supabase-fake"
import { createFixtures } from "./helpers/org-fixtures"
import { sessionAuth } from "./helpers/misc-supabase-session"

vi.mock("@/lib/supabase/server", async () => await import("./helpers/misc-supabase-session"))

import {
  changePasswordAction,
  deleteProfileAction,
  updateProfileAction,
} from "@/app/app/profile/actions"

// Ações do próprio perfil: nome, senha e exclusão da conta (LGPD). Todas operam sobre o
// usuário da SESSÃO — nenhuma recebe id do cliente. A exclusão remove do Auth e do banco,
// anonimiza os rastros textuais e desativa o grupo que ficar vazio.

const fx = createFixtures("AcaoPerfil")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })
const row = (id: string) => prisma.user.findUnique({ where: { id } })
const orgRow = (id: string) => prisma.organization.findUniqueOrThrow({ where: { id } })

beforeEach(() => {
  sessionAuth.reset()
  fakeSupabase.reset()
})

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("updateProfileAction", () => {
  it("atualiza o nome do usuário da sessão, aparado", async () => {
    const user = await fx.user({ name: "Nome Antigo" })
    const other = await fx.user({ name: "Outra Pessoa" })
    sessionAuth.userId = user

    expect(await updateProfileAction({ name: "  Nome Novo  " })).toEqual({})

    expect(await row(user)).toMatchObject({ name: "Nome Novo" })
    expect(await row(other)).toMatchObject({ name: "Outra Pessoa" })
  })

  it("recusa nome curto ou longo demais", async () => {
    const user = await fx.user({ name: "Nome Antigo" })
    sessionAuth.userId = user

    expect(await updateProfileAction({ name: "A" })).toEqual({ error: "name" })
    expect((await updateProfileAction({ name: "x".repeat(256) })).error).toBeTruthy()
    expect(await row(user)).toMatchObject({ name: "Nome Antigo" })
  })

  it("sem sessão devolve erro e não altera ninguém", async () => {
    const user = await fx.user({ name: "Nome Antigo" })
    sessionAuth.userId = null

    expect(await updateProfileAction({ name: "Invasor" })).toEqual({ error: "unauthenticated" })
    expect(await row(user)).toMatchObject({ name: "Nome Antigo" })
  })
})

describe("changePasswordAction", () => {
  const valid = { password: "nova-senha-123", confirm: "nova-senha-123" }

  it("troca a senha no Auth", async () => {
    sessionAuth.userId = await fx.user()
    expect(await changePasswordAction(valid)).toEqual({})
    expect(sessionAuth.updates).toEqual([{ password: valid.password }])
  })

  it("recusa senha curta e confirmação diferente sem chamar o Auth", async () => {
    sessionAuth.userId = await fx.user()
    expect(await changePasswordAction({ password: "curta", confirm: "curta" })).toEqual({
      error: "passwordMin8",
    })
    expect(await changePasswordAction({ ...valid, confirm: "outra-senha-123" })).toEqual({
      error: "passwordsNoMatch",
    })
    expect(sessionAuth.updates).toEqual([])
  })

  it("sem sessão devolve erro; erro do Auth é repassado", async () => {
    sessionAuth.userId = null
    expect(await changePasswordAction(valid)).toEqual({ error: "unauthenticated" })
    expect(sessionAuth.updates).toEqual([])

    sessionAuth.userId = await fx.user()
    sessionAuth.updateError = "New password should be different from the old password."
    expect(await changePasswordAction(valid)).toEqual({
      error: "New password should be different from the old password.",
    })
  })
})

describe("deleteProfileAction", () => {
  it("sem sessão não exclui nada", async () => {
    const user = await fx.user()
    sessionAuth.userId = null

    expect(await deleteProfileAction()).toEqual({ error: "unauthenticated" })

    expect(await row(user)).not.toBeNull()
    expect(fakeSupabase.deletedUsers).toEqual([])
    expect(sessionAuth.signOuts).toBe(0)
  })

  it("remove a conta do Auth e do banco, anonimiza os rastros e encerra a sessão", async () => {
    const orgId = await fx.org("Grupo")
    const keeper = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
    const user = await fx.user({ name: "Vai Embora", memberships: [[orgId, "RESEARCHER"]] })
    const email = `${user}@test.local`
    const researchId = await fx.research(orgId, { createdById: user, members: [user, keeper] })

    const feedback = await prisma.feedback.create({
      data: {
        type: "BUG",
        title: "título do relato",
        message: "m",
        createdById: user,
        createdByEmail: email,
        messages: {
          create: [
            { body: "minha mensagem", party: "AUTHOR", createdById: user, createdByEmail: email },
            {
              body: "resposta de quem fica",
              party: "ADMIN",
              createdById: keeper,
              createdByEmail: `${keeper}@test.local`,
            },
          ],
        },
      },
    })
    fx.tracked.feedbacks.add(feedback.id)
    const catalogRequest = await prisma.catalogRequest.create({
      data: {
        type: "ORGAN",
        payload: { namePt: fx.unique("x"), nameEn: fx.unique("x") },
        requestedById: user,
        requestedByEmail: email,
      },
    })
    fx.tracked.catalogRequests.add(catalogRequest.id)
    const join = await prisma.joinRequest.create({
      data: { email, requesterName: "Vai Embora", organizationName: fx.unique("Grupo pedido") },
    })
    fx.tracked.joinRequests.add(join.id)
    // Solicitação de OUTRA pessoa: não pode ser tocada.
    const otherJoin = await prisma.joinRequest.create({
      data: {
        email: `${keeper}@test.local`,
        requesterName: "Quem Fica",
        organizationName: fx.unique("Outro pedido"),
      },
    })
    fx.tracked.joinRequests.add(otherJoin.id)

    sessionAuth.userId = user
    expect(await deleteProfileAction()).toEqual({})

    expect(fakeSupabase.deletedUsers).toEqual([user])
    expect(sessionAuth.signOuts).toBe(1)
    expect(await row(user)).toBeNull()
    expect(await prisma.membership.count({ where: { userId: user } })).toBe(0)
    expect(await prisma.researchMember.count({ where: { userId: user } })).toBe(0)

    // As linhas permanecem; e-mail e nome são trocados pelo marcador.
    expect(await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } })).toMatchObject({
      title: "título do relato",
      createdById: null,
      createdByEmail: ANONYMIZED_EMAIL,
    })
    const messages = await prisma.feedbackMessage.findMany({
      where: { feedbackId: feedback.id },
      orderBy: { body: "asc" },
    })
    expect(messages).toEqual([
      expect.objectContaining({
        body: "minha mensagem",
        createdById: null,
        createdByEmail: ANONYMIZED_EMAIL,
      }),
      expect.objectContaining({
        body: "resposta de quem fica",
        createdById: keeper,
        createdByEmail: `${keeper}@test.local`,
      }),
    ])
    expect(
      await prisma.catalogRequest.findUniqueOrThrow({ where: { id: catalogRequest.id } }),
    ).toMatchObject({ requestedById: null, requestedByEmail: ANONYMIZED_EMAIL })
    expect(await prisma.joinRequest.findUniqueOrThrow({ where: { id: join.id } })).toMatchObject({
      email: ANONYMIZED_EMAIL,
      requesterName: ANONYMIZED_NAME,
    })
    expect(
      await prisma.joinRequest.findUniqueOrThrow({ where: { id: otherJoin.id } }),
    ).toMatchObject({ email: `${keeper}@test.local`, requesterName: "Quem Fica" })

    // Dados científicos e o grupo (que ainda tem membro) ficam.
    expect(await prisma.research.findUniqueOrThrow({ where: { id: researchId } })).toMatchObject({
      createdById: null,
      orgId,
    })
    expect((await orgRow(orgId)).deactivatedAt).toBeNull()
    expect(await row(keeper)).not.toBeNull()
  })

  it("o grupo que fica sem membros é desativado; os demais não", async () => {
    const alone = await fx.org("Só eu")
    const shared = await fx.org("Com mais gente")
    const user = await fx.user({
      memberships: [
        [alone, "ORG_ADMIN"],
        [shared, "RESEARCHER"],
      ],
    })
    await fx.user({ memberships: [[shared, "ORG_ADMIN"]] })
    await fx.research(alone, { createdById: user })

    sessionAuth.userId = user
    expect(await deleteProfileAction()).toEqual({})

    expect((await orgRow(alone)).deactivatedAt).not.toBeNull()
    expect(await prisma.research.count({ where: { orgId: alone } })).toBe(1)
    expect((await orgRow(shared)).deactivatedAt).toBeNull()
  })

  it("conta já ausente no Auth: o registro local é removido mesmo assim", async () => {
    const user = await fx.user()
    fakeSupabase.failNext.deleteUser = "User not found"
    sessionAuth.userId = user

    expect(await deleteProfileAction()).toEqual({})
    expect(await row(user)).toBeNull()
    expect(sessionAuth.signOuts).toBe(1)
  })

  it("outra falha do Auth interrompe: a conta e a sessão continuam", async () => {
    const orgId = await fx.org("Grupo")
    const user = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
    fakeSupabase.failNext.deleteUser = "Database error deleting user"
    sessionAuth.userId = user

    expect(await deleteProfileAction()).toEqual({ error: "Database error deleting user" })

    expect(await row(user)).not.toBeNull()
    expect(await prisma.membership.count({ where: { userId: user } })).toBe(1)
    expect((await orgRow(orgId)).deactivatedAt).toBeNull()
    expect(sessionAuth.signOuts).toBe(0)
  })

  // BUG: a exclusão do próprio perfil ignora a regra do último administrador (a que barra a
  // saída do grupo em DELETE /api/organizations/[orgId]/members/[userId]): o grupo com dados
  // fica só com pesquisadores, sem ninguém para geri-lo. Deveria exigir um sucessor antes.
  it.fails(
    "o último administrador de um grupo com dados e outros membros não exclui a conta",
    async () => {
      const orgId = await fx.org("Grupo sem sucessor")
      const lastAdmin = await fx.user({ memberships: [[orgId, "ORG_ADMIN"]] })
      await fx.user({ memberships: [[orgId, "RESEARCHER"]] })
      await fx.research(orgId, { createdById: lastAdmin })

      sessionAuth.userId = lastAdmin
      const result = await deleteProfileAction()

      expect(result.error).toBeTruthy()
      expect(await row(lastAdmin)).not.toBeNull()
      expect(await prisma.membership.count({ where: { orgId, role: "ORG_ADMIN" } })).toBe(1)
    },
  )
})
