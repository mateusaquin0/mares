import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"

// Isolamento no nível do BANCO (políticas RLS) — complementa isolation.test.ts, que cobre
// o isolamento na camada de aplicação (predicados das queries). Aqui a defesa testada é a
// última linha: mesmo que um bug na aplicação esqueça o filtro por org, o RLS barra.
//
// Como funciona: o Prisma conecta como superusuário e IGNORA o RLS. Para exercitá-lo,
// cada consulta roda numa transação onde trocamos para o role `authenticated` e definimos
// `request.jwt.claim.sub` — que é o que `auth.uid()` lê (ver tests/integration/supabase-shim.sql).
//
// Política sob teste (migration identity_multi_org), Animal SELECT:
//   is_org_member(research.orgId)  OR  (animal.isPublic AND research.isPublic)

// O id do User é o uuid do Supabase Auth: auth.uid() faz ::uuid, então precisa ser UUID.
const userA = randomUUID()

let orgA: string
let orgB: string
let animalA: string // pesquisa privada da org A  → visível só para membros de A
let animalBPriv: string // pesquisa privada da org B  → NUNCA visível para o usuário de A
let animalBPub: string // pesquisa pública da org B + animal público → visível a todos

async function createOrg(name: string) {
  const o = await prisma.organization.create({ data: { name }, select: { id: true } })
  return o.id
}

async function createResearch(orgId: string, name: string, isPublic: boolean) {
  const r = await prisma.research.create({
    data: { name, orgId, isPublic },
    select: { id: true },
  })
  return r.id
}

async function createAnimal(researchId: string, orgId: string, isPublic: boolean) {
  const a = await prisma.animal.create({
    data: { species: "Sotalia guianensis", researchId, orgId, isPublic },
    select: { id: true },
  })
  return a.id
}

/**
 * Executa `SELECT id FROM "Animal"` sob o contexto de autenticação informado, com o RLS ativo.
 * `userId = null` simula visitante anônimo (role `anon`, sem auth.uid()).
 */
async function visibleAnimalIds(userId: string | null): Promise<string[]> {
  const role = userId ? "authenticated" : "anon"
  return prisma.$transaction(async (tx) => {
    // `true` = escopo da transação (equivalente a SET LOCAL).
    await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, userId ?? "")
    await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.role', $1, true)`, role)
    // A partir daqui a sessão deixa de ser superusuário — só então o RLS é aplicado.
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
    const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Animal"`)
    return rows.map((r) => r.id)
  })
}

beforeAll(async () => {
  orgA = await createOrg("RLS Org A")
  orgB = await createOrg("RLS Org B")

  await prisma.user.create({
    data: { id: userA, email: `rls-${userA}@test.local`, name: "RLS User A" },
  })
  // Vínculo APENAS com a org A — é o que is_org_member() consulta.
  await prisma.membership.create({ data: { userId: userA, orgId: orgA } })

  const researchA = await createResearch(orgA, "RLS Pesquisa A (privada)", false)
  const researchBPriv = await createResearch(orgB, "RLS Pesquisa B (privada)", false)
  const researchBPub = await createResearch(orgB, "RLS Pesquisa B (pública)", true)

  animalA = await createAnimal(researchA, orgA, false)
  animalBPriv = await createAnimal(researchBPriv, orgB, false)
  animalBPub = await createAnimal(researchBPub, orgB, true)
})

afterAll(async () => {
  const orgIds = [orgA, orgB].filter(Boolean)
  await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.membership.deleteMany({ where: { userId: userA } })
  await prisma.user.deleteMany({ where: { id: userA } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  await prisma.$disconnect()
})

describe("RLS — isolamento entre organizações no nível do banco", () => {
  it("membro da org A enxerga o animal da própria org", async () => {
    // Asserção POSITIVA: garante que o contexto de auth foi aplicado de verdade.
    // Sem ela, um setup quebrado (RLS bloqueando tudo) passaria como se isolasse.
    const ids = await visibleAnimalIds(userA)
    expect(ids).toContain(animalA)
  })

  it("membro da org A NÃO enxerga animal privado da org B", async () => {
    const ids = await visibleAnimalIds(userA)
    expect(ids).not.toContain(animalBPriv)
  })

  it("animal público de pesquisa pública é visível mesmo fora da org", async () => {
    const ids = await visibleAnimalIds(userA)
    expect(ids).toContain(animalBPub)
  })

  it("visitante anônimo só enxerga o que é público", async () => {
    const ids = await visibleAnimalIds(null)
    expect(ids).toContain(animalBPub)
    expect(ids).not.toContain(animalA)
    expect(ids).not.toContain(animalBPriv)
  })
})
