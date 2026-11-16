import { randomBytes } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { TERMS_VERSION } from "../../../src/lib/terms"
import type { E2eFixtures, E2eUser, RoleKey } from "./fixtures"

// Dados da suíte E2E, criados e removidos direto no banco de testes (Prisma) e no Auth do
// projeto Supabase de testes (Admin API). Só é importado pelo global-setup/teardown — os
// testes em si falam com o app pelo navegador.
//
// Tudo o que a suíte cria é identificável: grupos e pesquisas começam com `e2e-<runId>`,
// e-mails são `e2e-<runId>-…@test.local`, itens de glossário têm chave `e2e_<runId>_…`. A
// limpeza apaga SÓ o que casa com esses prefixos: o mesmo banco guarda dados fictícios
// cadastrados à mão, que não podem ser tocados.

const EMAIL_DOMAIN = "@test.local"

export type Db = { prisma: PrismaClient; admin: SupabaseClient }

export function connect(vars: Record<string, string>): Db {
  // URL passada de forma explícita: o client NUNCA resolve o banco pelo `.env` da raiz.
  const prisma = new PrismaClient({ datasourceUrl: vars.DATABASE_URL })
  const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL!, vars.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { prisma, admin }
}

// Remove o que a suíte criou. Com `runId`, só o desta execução (teardown); sem ele, qualquer
// sobra de execuções anteriores que tenham sido interrompidas (setup).
export async function cleanup({ prisma, admin }: Db, runId?: string) {
  const namePrefix = runId ? `e2e-${runId}` : "e2e-"
  const keyPrefix = runId ? `e2e_${runId}` : "e2e_"
  const isOurEmail = (email: string | undefined) =>
    !!email && email.startsWith(namePrefix) && email.endsWith(EMAIL_DOMAIN)

  const orgs = await prisma.organization.findMany({
    where: { name: { startsWith: namePrefix } },
    select: { id: true },
  })
  const orgIds = orgs.map((o) => o.id)
  const users = await prisma.user.findMany({
    where: { email: { startsWith: namePrefix, endsWith: EMAIL_DOMAIN } },
    select: { id: true },
  })
  const userIds = users.map((u) => u.id)

  const animals = await prisma.animal.findMany({
    where: { orgId: { in: orgIds } },
    select: { id: true },
  })
  const samples = await prisma.sample.findMany({
    where: { orgId: { in: orgIds } },
    select: { id: true, analyses: { select: { id: true } } },
  })
  const entityIds = [
    ...animals.map((a) => a.id),
    ...samples.map((s) => s.id),
    ...samples.flatMap((s) => s.analyses.map((a) => a.id)),
  ]

  // AuditLog não tem chave estrangeira: sai por autor e por entidade, antes das entidades.
  await prisma.auditLog.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] },
  })
  // Animais levam amostras e análises (cascade); pesquisas levam protocolos e vínculos.
  await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })

  await prisma.organ.deleteMany({ where: { key: { startsWith: keyPrefix } } })
  await prisma.pathogen.deleteMany({ where: { key: { startsWith: keyPrefix } } })
  await prisma.examType.deleteMany({ where: { key: { startsWith: keyPrefix } } })

  // Usuários do Auth: a listagem é paginada e não filtra por e-mail no servidor.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Falha ao listar usuários do Auth de testes: ${error.message}`)
    for (const u of data.users) {
      if (!isOurEmail(u.email)) continue
      const res = await admin.auth.admin.deleteUser(u.id)
      if (res.error) throw new Error(`Falha ao remover usuário de teste: ${res.error.message}`)
    }
    if (data.users.length < 200) break
  }
}

// Cria o usuário no Auth já confirmado e com senha (nenhum e-mail é enviado: o SMTP do projeto
// de testes tem limite) e a linha local com o MESMO id, ativa e com os termos aceitos — o
// estado de quem já passou pelo convite e definiu a senha.
async function createUser(
  { prisma, admin }: Db,
  runId: string,
  password: string,
  slug: string,
  name: string,
  isSystemAdmin = false,
): Promise<E2eUser> {
  const email = `e2e-${runId}-${slug}${EMAIL_DOMAIN}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Falha ao criar usuário de teste (${slug}): ${error?.message}`)
  }
  await prisma.user.create({
    data: {
      id: data.user.id,
      email,
      name,
      isSystemAdmin,
      status: "ACTIVE",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  })
  return { id: data.user.id, email, name }
}

export async function seed(db: Db): Promise<E2eFixtures> {
  const { prisma } = db
  const runId = Date.now().toString(36)
  const prefix = `e2e-${runId}`
  const key = (slug: string) => `e2e_${runId}_${slug}`
  // Senha sorteada por execução; o sufixo garante os requisitos de complexidade do Auth.
  const password = `${randomBytes(12).toString("base64url")}aA1!`

  const user = (slug: string, name: string, isSystemAdmin = false) =>
    createUser(db, runId, password, slug, `${prefix} ${name}`, isSystemAdmin)
  const users: Record<RoleKey, E2eUser> = {
    orgAdmin: await user("orgadmin", "Admin do Grupo A"),
    researcher: await user("pesquisador", "Pesquisadora A"),
    otherOrg: await user("grupob", "Admin do Grupo B"),
    systemAdmin: await user("adminglobal", "Admin Global", true),
    signIn: await user("entrada", "Pessoa da Entrada"),
  }

  const orgA = await prisma.organization.create({ data: { name: `${prefix} Grupo A` } })
  const orgB = await prisma.organization.create({ data: { name: `${prefix} Grupo B` } })
  await prisma.membership.createMany({
    data: [
      { userId: users.orgAdmin.id, orgId: orgA.id, role: "ORG_ADMIN" },
      { userId: users.researcher.id, orgId: orgA.id, role: "RESEARCHER" },
      { userId: users.signIn.id, orgId: orgA.id, role: "RESEARCHER" },
      { userId: users.otherOrg.id, orgId: orgB.id, role: "ORG_ADMIN" },
    ],
  })

  // Glossário próprio da execução: a suíte não depende do que estiver semeado, e os rótulos
  // únicos tornam inequívoca a escolha nos seletores do protocolo.
  const group = await prisma.pathogenGroup.findFirst({ where: { usesScientificName: true } })
  if (!group) {
    throw new Error("Banco de testes sem grupos de patógeno: rode `npm run db:teste:seed`.")
  }
  const organName = `${prefix} Fígado`
  const organ = await prisma.organ.create({
    data: { key: key("figado"), name: { pt: organName, en: organName } },
  })
  const pathogenName = `Pathogenus e2e${runId}`
  const pathogen = await prisma.pathogen.create({
    data: {
      key: key("patogeno"),
      groupId: group.id,
      scientificName: pathogenName,
      taxonRank: "species",
    },
  })
  const examName = `${prefix} PCR`
  const examType = await prisma.examType.create({
    data: { key: key("pcr"), name: { pt: examName, en: examName } },
  })

  const research = (name: string, orgId: string, createdById: string, isPublic = false) =>
    prisma.research.create({
      data: { name: `${prefix} ${name}`, orgId, createdById, isPublic },
      select: { id: true, name: true },
    })
  const shared = await research("Pesquisa compartilhada", orgA.id, users.orgAdmin.id)
  const restricted = await research("Pesquisa restrita", orgA.id, users.orgAdmin.id)
  const publicMap = await research("Pesquisa pública", orgA.id, users.orgAdmin.id, true)
  const orgBResearch = await research("Pesquisa do grupo B", orgB.id, users.otherOrg.id)

  // A pesquisadora participa só da pesquisa compartilhada: a restrita é o caso de
  // "pesquisador não vinculado não enxerga os animais".
  await prisma.researchMember.create({
    data: { researchId: shared.id, userId: users.researcher.id },
  })

  const animal = async (
    slug: string,
    species: string,
    researchId: string,
    orgId: string,
    extra: { isPublic?: boolean; lat?: number; lon?: number } = {},
  ) => {
    const row = await prisma.animal.create({
      data: {
        controlId: `${prefix}-${slug}`,
        species,
        sex: "M",
        lifeStage: "ADULT",
        eventDate: new Date("2026-03-10T00:00:00Z"),
        municipality: "Florianópolis",
        state: "SC",
        strandingLat: extra.lat ?? null,
        strandingLon: extra.lon ?? null,
        isPublic: extra.isPublic ?? false,
        researchId,
        orgId,
      },
      select: { id: true, controlId: true, species: true },
    })
    return { id: row.id, controlId: row.controlId!, species: row.species! }
  }

  const sharedAnimal = await animal("A1", "Sotalia guianensis", shared.id, orgA.id, {
    lat: -27.6,
    lon: -48.45,
  })
  const restrictedAnimal = await animal("A2", "Pontoporia blainvillei", restricted.id, orgA.id)
  // Espécies fictícias e únicas: é por elas que o teste do mapa localiza (ou não) cada ponto
  // no meio dos dados públicos que o banco de testes já tiver.
  const mapPublic = await animal("MP", `Especius publicus e2e${runId}`, publicMap.id, orgA.id, {
    isPublic: true,
    lat: -27.1,
    lon: -48.2,
  })
  const mapHidden = await animal("MO", `Especius ocultus e2e${runId}`, publicMap.id, orgA.id, {
    isPublic: false,
    lat: -27.3,
    lon: -48.3,
  })
  const orgBAnimal = await animal("B1", "Tursiops truncatus", orgBResearch.id, orgB.id)

  // Um resultado positivo já lançado, para o dashboard do grupo A ter o que agregar
  // independentemente da ordem em que os demais testes rodam.
  await prisma.researchProtocol.create({
    data: {
      researchId: shared.id,
      organId: organ.id,
      pathogenId: pathogen.id,
      examTypeId: examType.id,
    },
  })
  const sample = await prisma.sample.create({
    data: {
      animalId: sharedAnimal.id,
      researchId: shared.id,
      orgId: orgA.id,
      organId: organ.id,
      identification: `${prefix}-S1`,
      sampleType: "tecido fresco",
      createdById: users.orgAdmin.id,
    },
  })
  await prisma.analysis.create({
    data: {
      sampleId: sample.id,
      pathogenId: pathogen.id,
      examTypeId: examType.id,
      result: "POSITIVO",
    },
  })

  return {
    runId,
    prefix,
    password,
    users,
    orgs: { a: { id: orgA.id, name: orgA.name }, b: { id: orgB.id, name: orgB.name } },
    catalog: {
      organ: { id: organ.id, label: organName },
      pathogen: { id: pathogen.id, label: pathogenName },
      examType: { id: examType.id, label: examName },
    },
    research: { shared, restricted, publicMap, orgB: orgBResearch },
    animals: {
      shared: sharedAnimal,
      restricted: restrictedAnimal,
      mapPublic,
      mapHidden,
      orgB: orgBAnimal,
    },
  }
}
