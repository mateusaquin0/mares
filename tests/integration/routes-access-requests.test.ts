import { describe, it, expect, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { json, login, req } from "./helpers/route"
import { createFixtures } from "./helpers/org-fixtures"

import { POST as requestAccess } from "@/app/api/access-requests/route"

// Formulário PÚBLICO de solicitação de acesso (cadastro fechado): funciona sem sessão, valida
// a entrada, recusa pendência duplicada para o mesmo e-mail e limita a cadência por IP.

const fx = createFixtures("RotasAcesso")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let ipSeq = 0
// Cada teste usa um IP próprio: o limite é por IP e vive na memória do processo.
const ownIp = () => `10.77.${Math.floor(Math.random() * 250)}.${++ipSeq}`

const email = (label: string) => {
  const value = `acesso-${label}-${randomUUID().slice(0, 8)}@test.local`
  fx.tracked.emails.add(value)
  return value
}
const post = (body: unknown, ip = ownIp()) =>
  requestAccess(req("/api/access-requests", { body, headers: { "x-forwarded-for": ip } }))
const valid = (address: string) => ({
  email: address,
  requesterName: "Responsável Teste",
  organizationName: fx.unique("Grupo solicitado"),
  acceptTerms: true,
})
const rowsOf = (address: string) => prisma.joinRequest.findMany({ where: { email: address } })

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("POST /api/access-requests (rota pública)", () => {
  it("aceita a solicitação SEM sessão e grava e-mail normalizado e nomes aparados", async () => {
    login(null)
    const address = email("ok")
    const body = valid(address)
    const res = await post({
      ...body,
      email: address.toUpperCase(),
      requesterName: `  ${body.requesterName} `,
      organizationName: ` ${body.organizationName}  `,
    })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ message: "Solicitação enviada" })

    const rows = await rowsOf(address)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: address,
      requesterName: body.requesterName,
      organizationName: body.organizationName,
      status: "PENDING",
      reviewedById: null,
    })
    // Solicitar não cria conta nem grupo.
    expect(await prisma.user.count({ where: { email: address } })).toBe(0)
    expect(await prisma.organization.count({ where: { name: body.organizationName } })).toBe(0)
  })

  it.each([
    ["e-mail inválido", { email: "sem-arroba" }],
    ["nome do responsável curto", { requesterName: "A" }],
    ["nome do grupo curto", { organizationName: "ab" }],
    ["termos não aceitos", { acceptTerms: false }],
    ["termos ausentes", { acceptTerms: undefined }],
  ])("422 com %s — nada é gravado", async (_label, over) => {
    login(null)
    const address = email("invalido")
    const res = await post({ ...valid(address), ...over })
    expect(res.status).toBe(422)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.validation)
    expect(await rowsOf(address)).toEqual([])
  })

  it("422 com corpo que não é JSON", async () => {
    login(null)
    expect((await post(undefined)).status).toBe(422)
  })

  it("409 quando o e-mail já tem solicitação pendente (sem diferenciar caixa)", async () => {
    login(null)
    const address = email("dup")
    expect((await post(valid(address))).status).toBe(201)
    const again = await post({ ...valid(address), email: address.toUpperCase() })
    expect(again.status).toBe(409)
    expect(await rowsOf(address)).toHaveLength(1)
  })

  it("depois de respondida, o mesmo e-mail pode solicitar de novo", async () => {
    login(null)
    const address = email("refaz")
    expect((await post(valid(address))).status).toBe(201)
    await prisma.joinRequest.updateMany({ where: { email: address }, data: { status: "REJECTED" } })
    expect((await post(valid(address))).status).toBe(201)
    const rows = await rowsOf(address)
    expect(rows.map((r) => r.status).sort()).toEqual(["PENDING", "REJECTED"])
  })

  it("429 na sexta solicitação do mesmo IP em uma hora; outro IP segue liberado", async () => {
    login(null)
    const ip = ownIp()
    for (let i = 0; i < 5; i++) {
      expect((await post(valid(email(`lote${i}`)), ip)).status).toBe(201)
    }
    const blockedAddress = email("bloqueado")
    const blocked = await post(valid(blockedAddress), ip)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await json<{ code: string }>(blocked)).code).toBe(ERROR_CODES.rateLimited)
    expect(await rowsOf(blockedAddress)).toEqual([])

    expect((await post(valid(blockedAddress))).status).toBe(201)
  })
})
