import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// A Data API do Supabase é SOMENTE LEITURA para authenticated e FECHADA para anon
// (migrations data_api_read_only e data_api_anon_closed).
// Regras sob teste:
//   • anon e authenticated não têm INSERT/UPDATE/DELETE/TRUNCATE em NENHUMA tabela do schema
//     public — toda escrita passa pelo servidor, que aplica papel, escopo por pesquisa,
//     protocolo e auditoria.
//   • Em particular, ninguém altera a própria linha de "User": era por ali que uma conta comum
//     se promovia a admin global ("isSystemAdmin").
//   • A leitura continua valendo sob RLS (o detalhe do isolamento está em rls.test.ts).
//
// Mesma mecânica de rls.test.ts: o Prisma conecta como superusuário e IGNORA privilégios e RLS,
// então cada operação roda numa transação onde trocamos para o role `authenticated` e definimos
// `request.jwt.claim.sub` — o que auth.uid() lê (ver tests/integration/supabase-shim.sql).

// Ids de User precisam ser UUID: auth.uid() faz ::uuid.
const researcher = randomUUID()
const orgAdmin = randomUUID()

let orgId: string
let researchId: string
let animalId: string

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

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({ data: { name: "Data API Org" }, select: { id: true } })
  ).id
  await prisma.user.createMany({
    data: [
      { id: researcher, email: `ro-${researcher}@test.local`, name: "Pesquisador" },
      { id: orgAdmin, email: `ro-${orgAdmin}@test.local`, name: "Admin" },
    ],
  })
  await prisma.membership.createMany({
    data: [
      { userId: researcher, orgId, role: "RESEARCHER" },
      { userId: orgAdmin, orgId, role: "ORG_ADMIN" },
    ],
  })
  researchId = (
    await prisma.research.create({
      data: { name: "Data API (test)", orgId, members: { create: { userId: researcher } } },
      select: { id: true },
    })
  ).id
  animalId = (
    await prisma.animal.create({
      data: { researchId, orgId, controlId: `RO-${randomUUID().slice(0, 8)}` },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  await prisma.animal.deleteMany({ where: { orgId } })
  await prisma.research.deleteMany({ where: { orgId } })
  await prisma.membership.deleteMany({ where: { userId: { in: [researcher, orgAdmin] } } })
  await prisma.user.deleteMany({ where: { id: { in: [researcher, orgAdmin] } } })
  await prisma.organization.deleteMany({ where: { id: orgId } })
  await prisma.$disconnect()
})

describe("Data API — somente leitura", () => {
  it("anon e authenticated não têm privilégio de escrita em nenhuma tabela", async () => {
    // has_any_column_privilege cobre também concessões por coluna (INSERT/UPDATE).
    const writable = await prisma.$queryRawUnsafe<{ table: string; role: string; priv: string }[]>(
      `SELECT c.relname AS "table", r.role, p.priv
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
        CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS p(priv)
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND CASE
                WHEN p.priv IN ('INSERT', 'UPDATE')
                  THEN has_any_column_privilege(r.role, c.oid, p.priv)
                ELSE has_table_privilege(r.role, c.oid, p.priv)
              END
        ORDER BY 1, 2, 3`,
    )
    expect(writable).toEqual([])
  })

  it("anon não tem privilégio de leitura em nenhuma tabela", async () => {
    const readable = await prisma.$queryRawUnsafe<{ table: string }[]>(
      `SELECT c.relname AS "table"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND has_any_column_privilege('anon', c.oid, 'SELECT')
        ORDER BY 1`,
    )
    expect(readable).toEqual([])
  })

  it("o próprio usuário lê a sua linha de User", async () => {
    // Asserção POSITIVA: sem ela, um setup quebrado (role sem acesso algum) passaria como regra.
    const rows = await asUser(researcher, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "User" WHERE id = $1`, researcher),
    )
    expect(rows).toHaveLength(1)
  })

  it("o usuário NÃO se promove a admin global", async () => {
    await expect(
      asUser(researcher, (tx) =>
        tx.$executeRawUnsafe(`UPDATE "User" SET "isSystemAdmin" = true WHERE id = $1`, researcher),
      ),
    ).rejects.toThrow(/permission denied/i)

    const row = await prisma.user.findUnique({
      where: { id: researcher },
      select: { isSystemAdmin: true },
    })
    expect(row?.isSystemAdmin).toBe(false)
  })

  it("pesquisador vinculado NÃO publica a pesquisa pela Data API", async () => {
    await expect(
      asUser(researcher, (tx) =>
        tx.$executeRawUnsafe(`UPDATE "Research" SET "isPublic" = true WHERE id = $1`, researchId),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it("nem o admin do grupo exclui um indivíduo pela Data API", async () => {
    await expect(
      asUser(orgAdmin, (tx) =>
        tx.$executeRawUnsafe(`DELETE FROM "Animal" WHERE id = $1`, animalId),
      ),
    ).rejects.toThrow(/permission denied/i)
    expect(await prisma.animal.count({ where: { id: animalId } })).toBe(1)
  })
})
