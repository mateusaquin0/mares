import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Escrita no protocolo por PESQUISADOR VINCULADO (migration protocol_researcher_write).
// Regras sob teste (docs/PERMISSOES.md §Protocolo):
//   • INSERT/UPDATE (adicionar, ativar/desativar) — quem enxerga a pesquisa: ORG_ADMIN da org
//     ou RESEARCHER vinculado via ResearchMember.
//   • DELETE — irreversível, então só ORG_ADMIN ou o CRIADOR da pesquisa. Um vinculado que não
//     criou a pesquisa desativa, mas NÃO exclui: é a assimetria principal deste arquivo.
//
// Mesma mecânica de rls.test.ts: o Prisma conecta como superusuário e IGNORA o RLS, então
// cada operação roda numa transação onde trocamos para o role `authenticated` e definimos
// `request.jwt.claim.sub` — o que auth.uid() lê (ver tests/integration/supabase-shim.sql).

// Ids de User precisam ser UUID: auth.uid() faz ::uuid.
const creatorResearcher = randomUUID() // pesquisador que CRIOU a pesquisa (e é vinculado)
const linkedResearcher = randomUUID() // pesquisador VINCULADO, mas não criador
const strangerResearcher = randomUUID() // pesquisador da MESMA org, sem vínculo
const orgAdminA = randomUUID() // admin da org da pesquisa, sem vínculo com ela
const otherOrgAdmin = randomUUID() // admin de OUTRA org

let orgA: string
let orgB: string
let researchA: string
let pathogenId: string
let examTypeId: string
let groupId: string
// Um órgão por combinação: (pesquisa, órgão, patógeno, exame) é única, então reusar o mesmo
// órgão faria o INSERT falhar por unicidade — e não por RLS, que é o que este arquivo testa.
//   [0] entrada pré-existente (UPDATE + DELETE pelo criador)
//   [1] INSERT do vinculado   [2] INSERT do sem-vínculo   [3] INSERT do admin de outra org
//   [4] segunda entrada pré-existente (DELETE pelo admin da org)
const organs: string[] = []
// Entradas pré-existentes, usadas nos testes de UPDATE/DELETE.
let entryId: string
let entryForAdmin: string

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

// INSERT/UPDATE/DELETE barrados por RLS não levantam erro: simplesmente não afetam linhas
// (exceto o INSERT, que viola o WITH CHECK e ERRA). Por isso cada helper devolve um booleano.
async function tryInsert(userId: string, organId: string): Promise<boolean> {
  try {
    await asUser(userId, (tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO "ResearchProtocol" (id, "researchId", "organId", "pathogenId", "examTypeId", status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        randomUUID(),
        researchA,
        organId,
        pathogenId,
        examTypeId,
      ),
    )
    return true
  } catch {
    return false
  }
}

async function tryUpdate(userId: string): Promise<boolean> {
  const affected = await asUser(userId, (tx) =>
    tx.$executeRawUnsafe(
      `UPDATE "ResearchProtocol" SET status = 'INACTIVE' WHERE id = $1`,
      entryId,
    ),
  )
  return affected > 0
}

async function tryDelete(userId: string, id: string): Promise<boolean> {
  const affected = await asUser(userId, (tx) =>
    tx.$executeRawUnsafe(`DELETE FROM "ResearchProtocol" WHERE id = $1`, id),
  )
  return affected > 0
}

beforeAll(async () => {
  orgA = (
    await prisma.organization.create({
      data: { name: "Protocolo RLS Org A" },
      select: { id: true },
    })
  ).id
  orgB = (
    await prisma.organization.create({
      data: { name: "Protocolo RLS Org B" },
      select: { id: true },
    })
  ).id

  await prisma.user.createMany({
    data: [
      { id: creatorResearcher, email: `cre-${creatorResearcher}@test.local`, name: "Criador" },
      { id: linkedResearcher, email: `linked-${linkedResearcher}@test.local`, name: "Vinculado" },
      {
        id: strangerResearcher,
        email: `str-${strangerResearcher}@test.local`,
        name: "Sem vínculo",
      },
      { id: orgAdminA, email: `adma-${orgAdminA}@test.local`, name: "Admin org A" },
      { id: otherOrgAdmin, email: `other-${otherOrgAdmin}@test.local`, name: "Admin org B" },
    ],
  })
  await prisma.membership.createMany({
    data: [
      { userId: creatorResearcher, orgId: orgA, role: "RESEARCHER" },
      { userId: linkedResearcher, orgId: orgA, role: "RESEARCHER" },
      { userId: strangerResearcher, orgId: orgA, role: "RESEARCHER" },
      { userId: orgAdminA, orgId: orgA, role: "ORG_ADMIN" },
      { userId: otherOrgAdmin, orgId: orgB, role: "ORG_ADMIN" },
    ],
  })

  researchA = (
    await prisma.research.create({
      data: {
        name: "Pesquisa protocolo (test)",
        orgId: orgA,
        createdById: creatorResearcher,
        // Só criador e vinculado entram em ResearchMember; o admin da org não precisa.
        members: { create: [{ userId: creatorResearcher }, { userId: linkedResearcher }] },
      },
      select: { id: true },
    })
  ).id

  groupId = (
    await prisma.pathogenGroup.create({
      data: { key: "grp_test_protocol_rls", name: { pt: "Grupo", en: "Group" } },
      select: { id: true },
    })
  ).id
  for (let i = 0; i < 5; i++) {
    const o = await prisma.organ.create({
      data: { key: `organ_test_prls_${i}`, name: { pt: `Órgão ${i}`, en: `Organ ${i}` } },
      select: { id: true },
    })
    organs.push(o.id)
  }
  pathogenId = (
    await prisma.pathogen.create({
      data: { key: "pathogen_test_prls", groupId, scientificName: "Patógeno teste" },
      select: { id: true },
    })
  ).id
  examTypeId = (
    await prisma.examType.create({
      data: { key: "exam_test_prls", name: { pt: "Exame", en: "Exam" } },
      select: { id: true },
    })
  ).id

  entryId = (
    await prisma.researchProtocol.create({
      data: { researchId: researchA, organId: organs[0]!, pathogenId, examTypeId },
      select: { id: true },
    })
  ).id
  entryForAdmin = (
    await prisma.researchProtocol.create({
      data: { researchId: researchA, organId: organs[4]!, pathogenId, examTypeId },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  await prisma.researchProtocol.deleteMany({ where: { researchId: researchA } })
  await prisma.research.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
  const users = [creatorResearcher, linkedResearcher, strangerResearcher, orgAdminA, otherOrgAdmin]
  await prisma.membership.deleteMany({ where: { userId: { in: users } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await prisma.pathogen.deleteMany({ where: { id: pathogenId } })
  await prisma.examType.deleteMany({ where: { id: examTypeId } })
  await prisma.organ.deleteMany({ where: { id: { in: organs } } })
  await prisma.pathogenGroup.deleteMany({ where: { id: groupId } })
  await prisma.$disconnect()
})

describe("RLS — escrita no protocolo pelo pesquisador vinculado", () => {
  it("pesquisador VINCULADO insere entrada no protocolo da sua pesquisa", async () => {
    // Asserção POSITIVA: sem ela, um setup quebrado (RLS negando tudo) passaria como isolamento.
    expect(await tryInsert(linkedResearcher, organs[1]!)).toBe(true)
  })

  it("pesquisador da mesma org SEM vínculo não insere", async () => {
    expect(await tryInsert(strangerResearcher, organs[2]!)).toBe(false)
  })

  it("admin de OUTRA organização não insere", async () => {
    expect(await tryInsert(otherOrgAdmin, organs[3]!)).toBe(false)
  })

  it("pesquisador SEM vínculo não desativa entrada (UPDATE)", async () => {
    expect(await tryUpdate(strangerResearcher)).toBe(false)
  })

  it("pesquisador VINCULADO desativa entrada (UPDATE)", async () => {
    expect(await tryUpdate(linkedResearcher)).toBe(true)
  })

  it("vinculado que NÃO criou a pesquisa não exclui (só desativa)", async () => {
    // A assimetria da regra: ele acabou de conseguir desativar a mesma entrada acima.
    expect(await tryDelete(linkedResearcher, entryId)).toBe(false)
  })

  it("pesquisador SEM vínculo não exclui", async () => {
    expect(await tryDelete(strangerResearcher, entryId)).toBe(false)
  })

  it("CRIADOR da pesquisa exclui a entrada", async () => {
    expect(await tryDelete(creatorResearcher, entryId)).toBe(true)
  })

  it("admin da org exclui mesmo sem vínculo com a pesquisa", async () => {
    expect(await tryDelete(orgAdminA, entryForAdmin)).toBe(true)
  })
})
