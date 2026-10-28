import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Exclusão de indivíduo pelo pesquisador (migration animal_hidden_in_research).
// Regras sob teste (docs/PERMISSOES.md §Animais):
//   • ORG_ADMIN exclui qualquer indivíduo da org, compartilhado ou não.
//   • Pesquisador VINCULADO à pesquisa primária exclui — desde que nenhuma outra pesquisa
//     estude o indivíduo (participação ACEITA). Convite pendente não conta.
//   • Quem só integra a pesquisa participante, ou não integra nenhuma, não exclui.
//
// Mesma mecânica de authored-delete.test.ts: troca para o role `authenticated` dentro de uma
// transação para o RLS valer (o Prisma, superusuário, passa por cima dele).

const primaryMember = randomUUID() // vinculado à pesquisa primária
const participantMember = randomUUID() // vinculado só à pesquisa que recebeu o indivíduo
const stranger = randomUUID() // da org, sem vínculo com nenhuma das duas
const orgAdmin = randomUUID()

let orgId: string
let primary: string
let participant: string

// Um indivíduo por cenário — DELETE que passa consome a linha.
const animals: Record<string, string> = {}

async function asUser<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, userId)
    await tx.$queryRawUnsafe(
      `SELECT set_config('request.jwt.claim.role', $1, true)`,
      "authenticated",
    )
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}

// DELETE barrado por RLS não levanta erro: simplesmente não afeta linhas.
async function tryDeleteAnimal(userId: string, id: string): Promise<boolean> {
  const affected = await asUser(userId, (tx) =>
    tx.$executeRawUnsafe(`DELETE FROM "Animal" WHERE id = $1`, id),
  )
  return affected > 0
}

async function makeAnimal(key: string, share?: "ACCEPTED" | "PENDING") {
  const row = await prisma.animal.create({
    data: {
      researchId: primary,
      orgId,
      controlId: `DEL-${key}-${randomUUID().slice(0, 8)}`,
      ...(share ? { participations: { create: { researchId: participant, status: share } } } : {}),
    },
    select: { id: true },
  })
  animals[key] = row.id
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({ data: { name: "Exclusão RLS Org" }, select: { id: true } })
  ).id

  const users = [
    { id: primaryMember, name: "Primária" },
    { id: participantMember, name: "Participante" },
    { id: stranger, name: "Sem vínculo" },
    { id: orgAdmin, name: "Admin" },
  ]
  await prisma.user.createMany({
    data: users.map((u) => ({ ...u, email: `del-${u.id}@test.local` })),
  })
  await prisma.membership.createMany({
    data: [
      { userId: primaryMember, orgId, role: "RESEARCHER" },
      { userId: participantMember, orgId, role: "RESEARCHER" },
      { userId: stranger, orgId, role: "RESEARCHER" },
      { userId: orgAdmin, orgId, role: "ORG_ADMIN" },
    ],
  })

  primary = (
    await prisma.research.create({
      data: { name: "Primária (test)", orgId, members: { create: { userId: primaryMember } } },
      select: { id: true },
    })
  ).id
  participant = (
    await prisma.research.create({
      data: {
        name: "Participante (test)",
        orgId,
        members: { create: { userId: participantMember } },
      },
      select: { id: true },
    })
  ).id

  await makeAnimal("notShared")
  await makeAnimal("pendingOnly", "PENDING")
  await makeAnimal("shared", "ACCEPTED")
  await makeAnimal("sharedForAdmin", "ACCEPTED")
  await makeAnimal("notSharedForStranger")
})

afterAll(async () => {
  await prisma.animal.deleteMany({ where: { orgId } })
  await prisma.research.deleteMany({ where: { orgId } })
  const ids = [primaryMember, participantMember, stranger, orgAdmin]
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.organization.deleteMany({ where: { id: orgId } })
  await prisma.$disconnect()
})

describe("RLS — exclusão de indivíduo", () => {
  it("membro da pesquisa primária exclui o indivíduo não compartilhado", async () => {
    // Asserção POSITIVA: sem ela, um setup quebrado (RLS negando tudo) passaria como regra.
    expect(await tryDeleteAnimal(primaryMember, animals.notShared!)).toBe(true)
  })

  it("convite ainda pendente não impede a exclusão", async () => {
    expect(await tryDeleteAnimal(primaryMember, animals.pendingOnly!)).toBe(true)
  })

  it("membro da primária NÃO exclui o indivíduo compartilhado", async () => {
    expect(await tryDeleteAnimal(primaryMember, animals.shared!)).toBe(false)
  })

  it("membro só da pesquisa participante não exclui", async () => {
    expect(await tryDeleteAnimal(participantMember, animals.shared!)).toBe(false)
  })

  it("pesquisador da org sem vínculo não exclui", async () => {
    expect(await tryDeleteAnimal(stranger, animals.notSharedForStranger!)).toBe(false)
  })

  it("admin da org exclui mesmo o compartilhado", async () => {
    expect(await tryDeleteAnimal(orgAdmin, animals.sharedForAdmin!)).toBe(true)
  })
})
