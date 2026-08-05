import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Exclusão por autoria em Sample e AnimalMedia (migrations media_uploader_can_delete,
// sample_creator_can_delete e orphan_author_can_delete).
// Regras sob teste (docs/PERMISSOES.md §Amostras e §Mídia):
//   • COM autor  — só o autor ou o ORG_ADMIN excluem; outro membro da pesquisa NÃO.
//   • SEM autor (órfão: registro anterior à coluna de autoria, ou autor removido do sistema)
//     — qualquer pesquisador VINCULADO à pesquisa exclui. É a assimetria principal daqui.
//   • Em nenhum caso um pesquisador SEM vínculo, ou de outra org, exclui.
//
// Mesma mecânica de protocol-write-access.test.ts: o Prisma conecta como superusuário e IGNORA
// o RLS, então cada operação roda numa transação onde trocamos para o role `authenticated` e
// definimos `request.jwt.claim.sub` — o que auth.uid() lê (ver tests/integration/supabase-shim.sql).

// Ids de User precisam ser UUID: auth.uid() faz ::uuid.
const author = randomUUID() // pesquisador vinculado que cadastrou a amostra / enviou o arquivo
const linkedResearcher = randomUUID() // pesquisador vinculado, mas não é o autor
const strangerResearcher = randomUUID() // pesquisador da MESMA org, sem vínculo com a pesquisa
const orgAdminA = randomUUID() // admin da org da pesquisa, sem vínculo com ela
const otherOrgAdmin = randomUUID() // admin de OUTRA org

let orgA: string
let orgB: string
let researchA: string
let animalA: string
let organId: string

// Um registro por cenário — DELETE que passa consome a linha, então cada teste tem a sua.
//   samples.ownedByAuthor  → excluída pelo autor
//   samples.ownedForOthers → alvo das tentativas negadas (vinculado, sem vínculo, outra org)
//   samples.ownedForAdmin  → excluída pelo admin da org
//   samples.orphanForLinked / orphanForStranger → amostra SEM autor
const samples: Record<string, string> = {}
const media: Record<string, string> = {}

/** Roda `fn` sob o contexto de auth informado, com o RLS realmente aplicado. */
async function asUser<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // `true` = escopo da transação (equivalente a SET LOCAL).
    await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, userId)
    await tx.$queryRawUnsafe(
      `SELECT set_config('request.jwt.claim.role', $1, true)`,
      "authenticated",
    )
    // A partir daqui a sessão deixa de ser superusuária — só então o RLS vale.
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}

// DELETE barrado por RLS não levanta erro: simplesmente não afeta linhas. Daí o booleano.
async function tryDeleteSample(userId: string, id: string): Promise<boolean> {
  const affected = await asUser(userId, (tx) =>
    tx.$executeRawUnsafe(`DELETE FROM "Sample" WHERE id = $1`, id),
  )
  return affected > 0
}

async function tryDeleteMedia(userId: string, id: string): Promise<boolean> {
  const affected = await asUser(userId, (tx) =>
    tx.$executeRawUnsafe(`DELETE FROM "AnimalMedia" WHERE id = $1`, id),
  )
  return affected > 0
}

/** Cria uma amostra com o autor informado (null = órfã) e devolve o id. */
async function makeSample(key: string, createdById: string | null) {
  const row = await prisma.sample.create({
    data: {
      animalId: animalA,
      researchId: researchA,
      organId,
      orgId: orgA,
      identification: `AUT-${key}-${randomUUID().slice(0, 8)}`,
      sampleType: "tecido fresco",
      createdById,
    },
    select: { id: true },
  })
  samples[key] = row.id
}

/** Cria um arquivo com o autor informado (null = órfão) e devolve o id. */
async function makeMedia(key: string, uploadedById: string | null) {
  const row = await prisma.animalMedia.create({
    data: {
      animalId: animalA,
      url: `${animalA}/${randomUUID()}_arquivo.pdf`,
      mimeType: "application/pdf",
      uploadedById,
    },
    select: { id: true },
  })
  media[key] = row.id
}

beforeAll(async () => {
  orgA = (
    await prisma.organization.create({ data: { name: "Autoria RLS Org A" }, select: { id: true } })
  ).id
  orgB = (
    await prisma.organization.create({ data: { name: "Autoria RLS Org B" }, select: { id: true } })
  ).id

  await prisma.user.createMany({
    data: [
      { id: author, email: `aut-${author}@test.local`, name: "Autor" },
      { id: linkedResearcher, email: `lnk-${linkedResearcher}@test.local`, name: "Vinculado" },
      {
        id: strangerResearcher,
        email: `str-${strangerResearcher}@test.local`,
        name: "Sem vínculo",
      },
      { id: orgAdminA, email: `adma-${orgAdminA}@test.local`, name: "Admin org A" },
      { id: otherOrgAdmin, email: `oth-${otherOrgAdmin}@test.local`, name: "Admin org B" },
    ],
  })
  await prisma.membership.createMany({
    data: [
      { userId: author, orgId: orgA, role: "RESEARCHER" },
      { userId: linkedResearcher, orgId: orgA, role: "RESEARCHER" },
      { userId: strangerResearcher, orgId: orgA, role: "RESEARCHER" },
      { userId: orgAdminA, orgId: orgA, role: "ORG_ADMIN" },
      { userId: otherOrgAdmin, orgId: orgB, role: "ORG_ADMIN" },
    ],
  })

  researchA = (
    await prisma.research.create({
      data: {
        name: "Pesquisa autoria (test)",
        orgId: orgA,
        createdById: author,
        // Autor e o outro pesquisador são membros; o admin da org não precisa de vínculo.
        members: { create: [{ userId: author }, { userId: linkedResearcher }] },
      },
      select: { id: true },
    })
  ).id

  animalA = (
    await prisma.animal.create({
      data: { researchId: researchA, orgId: orgA, controlId: `AUT-${randomUUID().slice(0, 8)}` },
      select: { id: true },
    })
  ).id

  organId = (
    await prisma.organ.create({
      data: {
        key: `organ_test_auth_${randomUUID().slice(0, 8)}`,
        name: { pt: "Fígado", en: "Liver" },
      },
      select: { id: true },
    })
  ).id

  await makeSample("ownedByAuthor", author)
  await makeSample("ownedForOthers", author)
  await makeSample("ownedForAdmin", author)
  await makeSample("orphanForLinked", null)
  await makeSample("orphanForStranger", null)
  await makeSample("orphanForOtherOrg", null)

  await makeMedia("ownedByAuthor", author)
  await makeMedia("ownedForOthers", author)
  await makeMedia("orphanForLinked", null)
  await makeMedia("orphanForStranger", null)
})

afterAll(async () => {
  await prisma.sample.deleteMany({ where: { orgId: orgA } })
  await prisma.animalMedia.deleteMany({ where: { animalId: animalA } })
  await prisma.animal.deleteMany({ where: { orgId: orgA } })
  await prisma.research.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
  const users = [author, linkedResearcher, strangerResearcher, orgAdminA, otherOrgAdmin]
  await prisma.membership.deleteMany({ where: { userId: { in: users } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await prisma.organ.deleteMany({ where: { id: organId } })
  await prisma.$disconnect()
})

describe("RLS — exclusão de amostra por autoria", () => {
  it("o AUTOR exclui a própria amostra", async () => {
    // Asserção POSITIVA: sem ela, um setup quebrado (RLS negando tudo) passaria como regra.
    expect(await tryDeleteSample(author, samples.ownedByAuthor!)).toBe(true)
  })

  it("outro membro da pesquisa NÃO exclui amostra que tem autor", async () => {
    expect(await tryDeleteSample(linkedResearcher, samples.ownedForOthers!)).toBe(false)
  })

  it("admin da org exclui mesmo sem vínculo com a pesquisa", async () => {
    expect(await tryDeleteSample(orgAdminA, samples.ownedForAdmin!)).toBe(true)
  })

  it("membro da pesquisa exclui amostra ÓRFÃ (sem autor)", async () => {
    // O ponto da migration orphan_author_can_delete: o mesmo usuário foi barrado acima na
    // amostra com autor, e aqui passa porque não há dono.
    expect(await tryDeleteSample(linkedResearcher, samples.orphanForLinked!)).toBe(true)
  })

  it("pesquisador da org SEM vínculo não exclui amostra órfã", async () => {
    expect(await tryDeleteSample(strangerResearcher, samples.orphanForStranger!)).toBe(false)
  })

  it("admin de OUTRA organização não exclui amostra órfã", async () => {
    expect(await tryDeleteSample(otherOrgAdmin, samples.orphanForOtherOrg!)).toBe(false)
  })
})

describe("RLS — exclusão de mídia por autoria", () => {
  it("quem ENVIOU exclui o próprio arquivo", async () => {
    expect(await tryDeleteMedia(author, media.ownedByAuthor!)).toBe(true)
  })

  it("outro membro da pesquisa NÃO exclui arquivo que tem autor", async () => {
    expect(await tryDeleteMedia(linkedResearcher, media.ownedForOthers!)).toBe(false)
  })

  it("membro da pesquisa exclui arquivo ÓRFÃO (sem autor)", async () => {
    expect(await tryDeleteMedia(linkedResearcher, media.orphanForLinked!)).toBe(true)
  })

  it("pesquisador da org SEM vínculo não exclui arquivo órfão", async () => {
    expect(await tryDeleteMedia(strangerResearcher, media.orphanForStranger!)).toBe(false)
  })
})
