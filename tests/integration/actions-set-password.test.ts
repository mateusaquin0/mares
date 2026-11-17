import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { TERMS_VERSION } from "@/lib/terms"
import { createFixtures } from "./helpers/org-fixtures"
import { sessionAuth } from "./helpers/misc-supabase-session"

vi.mock("@/lib/supabase/server", async () => await import("./helpers/misc-supabase-session"))

import { setPasswordAction } from "@/app/auth/set-password/actions"

// Aceite do convite: o convidado define a senha, aceita os Termos de Uso e a conta passa de
// INVITED para ACTIVE. O Auth é o substituto de sessão; o banco é o de verdade.

const fx = createFixtures("AcaoSenha")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })
const valid = { password: "senha-segura-1", confirm: "senha-segura-1", acceptTerms: true }
const row = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } })

beforeEach(() => sessionAuth.reset())

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("setPasswordAction", () => {
  it("define a senha, registra o aceite dos termos e ativa a conta", async () => {
    const invited = await fx.user({ status: "INVITED" })
    const bystander = await fx.user({ status: "INVITED" })
    sessionAuth.userId = invited
    const before = Date.now()

    expect(await setPasswordAction(valid)).toEqual({})

    expect(sessionAuth.updates).toEqual([{ password: valid.password }])
    const user = await row(invited)
    expect(user).toMatchObject({ status: "ACTIVE", termsVersion: TERMS_VERSION })
    expect(user.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 5_000)
    // Só a conta da sessão é alterada.
    expect(await row(bystander)).toMatchObject({
      status: "INVITED",
      termsVersion: null,
      termsAcceptedAt: null,
    })
  })

  it.each([
    ["senha com menos de 8 caracteres", { password: "curta", confirm: "curta" }, "passwordMin8"],
    ["confirmação diferente", { confirm: "outra-senha-9" }, "passwordsNoMatch"],
    ["termos não aceitos", { acceptTerms: false }, "termsRequired"],
  ])("recusa %s sem tocar no Auth nem na conta", async (_label, over, error) => {
    const invited = await fx.user({ status: "INVITED" })
    sessionAuth.userId = invited

    expect(await setPasswordAction({ ...valid, ...over })).toEqual({ error })

    expect(sessionAuth.updates).toEqual([])
    expect(await row(invited)).toMatchObject({ status: "INVITED", termsAcceptedAt: null })
  })

  it("sem sessão (link expirado) devolve erro e não altera nada", async () => {
    const invited = await fx.user({ status: "INVITED" })
    sessionAuth.userId = null

    const result = await setPasswordAction(valid)

    expect(result.error).toMatch(/Sessão expirada/)
    expect(sessionAuth.updates).toEqual([])
    expect(await row(invited)).toMatchObject({ status: "INVITED" })
  })

  it("se o Auth recusa a senha, a conta continua INVITED e sem aceite", async () => {
    const invited = await fx.user({ status: "INVITED" })
    sessionAuth.userId = invited
    sessionAuth.updateError = "Password is too weak"

    expect(await setPasswordAction(valid)).toEqual({ error: "Password is too weak" })

    expect(await row(invited)).toMatchObject({
      status: "INVITED",
      termsVersion: null,
      termsAcceptedAt: null,
    })
  })

  it("sessão de um usuário sem registro local não quebra a ação", async () => {
    const ghost = randomUUID()
    sessionAuth.userId = ghost

    expect(await setPasswordAction(valid)).toEqual({})

    expect(sessionAuth.updates).toEqual([{ password: valid.password }])
    expect(await prisma.user.count({ where: { id: ghost } })).toBe(0)
  })
})
