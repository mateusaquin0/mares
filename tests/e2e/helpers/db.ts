import { randomBytes } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { TERMS_VERSION } from "../../../src/lib/terms"
import type { E2eAnimal, E2eFixtures, E2eUser, RoleKey } from "./fixtures"

// Dados da suíte E2E, criados e removidos direto no banco de testes (Prisma) e no Auth do
// projeto Supabase de testes (Admin API). Só é importado pelo global-setup/teardown — os
// testes em si falam com o app pelo navegador.
//
// Tudo o que a suíte cria é identificável: grupos e pesquisas começam com `e2e-<runId>`,
// e-mails são `e2e-<runId>-…@test.local`, itens de glossário têm chave `e2e_<runId>_…`. A
// limpeza apaga SÓ o que casa com esses prefixos: o mesmo banco guarda dados fictícios
// cadastrados à mão, que não podem ser tocados.

const EMAIL_DOMAIN = "@test.local"

// Buckets do Storage em que o app grava (src/lib/media.ts e src/lib/feedback-media.ts). Cada
// objeto mora numa pasta com o id do animal / do ticket — é por ela que a limpeza os alcança.
const MEDIA_BUCKET = "animal-media"
const FEEDBACK_BUCKET = "feedback-media"

export type Db = { prisma: PrismaClient; admin: SupabaseClient }

export function connect(vars: Record<string, string>): Db {
  // URL passada de forma explícita: o client NUNCA resolve o banco pelo `.env` da raiz.
  const prisma = new PrismaClient({ datasourceUrl: vars.DATABASE_URL })
  const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL!, vars.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { prisma, admin }
}

async function existingBuckets(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.storage.listBuckets()
  if (error) throw new Error(`Falha ao listar buckets do Storage de testes: ${error.message}`)
  return new Set(data.map((b) => b.name))
}

// Apaga os objetos das pastas dadas. Só pastas de registros DA SUÍTE chegam aqui (ids de
// animais dos grupos `e2e-…` e de tickets abertos por usuários `e2e-…`).
async function removeStorageFolders(admin: SupabaseClient, bucket: string, folders: string[]) {
  if (folders.length === 0) return
  // O bucket só passa a existir no primeiro envio feito pelo app.
  if (!(await existingBuckets(admin)).has(bucket)) return
  for (const folder of folders) {
    const listed = await admin.storage.from(bucket).list(folder, { limit: 1000 })
    if (listed.error) {
      throw new Error(`Falha ao listar ${bucket}/${folder}: ${listed.error.message}`)
    }
    if (listed.data.length === 0) continue
    const removed = await admin.storage
      .from(bucket)
      .remove(listed.data.map((o) => `${folder}/${o.name}`))
    if (removed.error) {
      throw new Error(`Falha ao remover objetos de ${bucket}/${folder}: ${removed.error.message}`)
    }
  }
}

async function authUsers(admin: SupabaseClient, mine: (email: string | undefined) => boolean) {
  const found: string[] = []
  // A listagem é paginada e não filtra por e-mail no servidor.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Falha ao listar usuários do Auth de testes: ${error.message}`)
    for (const u of data.users) if (mine(u.email)) found.push(u.id)
    if (data.users.length < 200) break
  }
  return found
}

// O que a suíte ainda tem no banco, no Auth e no Storage — para conferir, depois de uma
// execução, que a limpeza não deixou sobra (`npx tsx tests/e2e/leftovers.ts`).
export async function leftovers({ prisma, admin }: Db): Promise<Record<string, number>> {
  const email = { startsWith: "e2e-", endsWith: EMAIL_DOMAIN }
  const key = { startsWith: "e2e_" }
  const counts: Record<string, number> = {
    organizations: await prisma.organization.count({ where: { name: { startsWith: "e2e-" } } }),
    users: await prisma.user.count({ where: { email } }),
    authUsers: (
      await authUsers(admin, (e) => !!e && e.startsWith("e2e-") && e.endsWith(EMAIL_DOMAIN))
    ).length,
    feedbacks: await prisma.feedback.count({ where: { createdByEmail: email } }),
    catalogRequests: await prisma.catalogRequest.count({ where: { requestedByEmail: email } }),
    joinRequests: await prisma.joinRequest.count({ where: { email } }),
    organs: await prisma.organ.count({ where: { key } }),
    pathogens: await prisma.pathogen.count({ where: { key } }),
    pathogenGroups: await prisma.pathogenGroup.count({ where: { key } }),
    examTypes: await prisma.examType.count({ where: { key } }),
    systems: await prisma.necropsySystem.count({ where: { key } }),
  }

  // Storage: toda pasta de primeiro nível leva o id de um animal/ticket. Sobra é a pasta cujo
  // dono não existe mais no banco.
  const buckets = await existingBuckets(admin)
  for (const bucket of [MEDIA_BUCKET, FEEDBACK_BUCKET]) {
    if (!buckets.has(bucket)) continue
    const { data, error } = await admin.storage.from(bucket).list("", { limit: 1000 })
    if (error) throw new Error(`Falha ao listar ${bucket}: ${error.message}`)
    const ids = data.map((f) => f.name)
    const alive =
      bucket === MEDIA_BUCKET
        ? await prisma.animal.findMany({ where: { id: { in: ids } }, select: { id: true } })
        : await prisma.feedback.findMany({ where: { id: { in: ids } }, select: { id: true } })
    const known = new Set(alive.map((r) => r.id))
    counts[`storageOrphans:${bucket}`] = ids.filter((id) => !known.has(id)).length
  }
  return counts
}

// Remove o que a suíte criou. Com `runId`, só o desta execução (teardown); sem ele, qualquer
// sobra de execuções anteriores que tenham sido interrompidas (setup).
export async function cleanup({ prisma, admin }: Db, runId?: string) {
  const namePrefix = runId ? `e2e-${runId}` : "e2e-"
  const keyPrefix = runId ? `e2e_${runId}` : "e2e_"
  const ourEmail = { startsWith: namePrefix, endsWith: EMAIL_DOMAIN }
  const isOurEmail = (email: string | undefined) =>
    !!email && email.startsWith(namePrefix) && email.endsWith(EMAIL_DOMAIN)

  const orgs = await prisma.organization.findMany({
    where: { name: { startsWith: namePrefix } },
    select: { id: true },
  })
  const orgIds = orgs.map((o) => o.id)
  const users = await prisma.user.findMany({ where: { email: ourEmail }, select: { id: true } })
  const userIds = users.map((u) => u.id)

  const animals = await prisma.animal.findMany({
    where: { orgId: { in: orgIds } },
    select: { id: true },
  })
  const animalIds = animals.map((a) => a.id)
  const samples = await prisma.sample.findMany({
    where: { orgId: { in: orgIds } },
    select: { id: true, analyses: { select: { id: true } } },
  })
  const exams = await prisma.necropsySystemExam.findMany({
    where: { animalId: { in: animalIds } },
    select: { id: true, findings: { select: { id: true } } },
  })
  const histopathology = await prisma.histopathologyFinding.findMany({
    where: { animalId: { in: animalIds } },
    select: { id: true },
  })
  const entityIds = [
    ...animalIds,
    ...samples.map((s) => s.id),
    ...samples.flatMap((s) => s.analyses.map((a) => a.id)),
    ...exams.map((e) => e.id),
    ...exams.flatMap((e) => e.findings.map((f) => f.id)),
    ...histopathology.map((h) => h.id),
  ]

  // Tickets de feedback: o e-mail do autor fica gravado no próprio ticket, então a sobra é
  // alcançada mesmo depois de o usuário ter sido apagado.
  const feedbacks = await prisma.feedback.findMany({
    where: { createdByEmail: ourEmail },
    select: { id: true },
  })
  const feedbackIds = feedbacks.map((f) => f.id)

  // Arquivos primeiro: depois de apagar as linhas, nada mais diria de quem eram os objetos.
  await removeStorageFolders(admin, MEDIA_BUCKET, animalIds)
  await removeStorageFolders(admin, FEEDBACK_BUCKET, feedbackIds)
  await prisma.feedback.deleteMany({ where: { id: { in: feedbackIds } } })

  await prisma.catalogRequest.deleteMany({ where: { requestedByEmail: ourEmail } })
  await prisma.joinRequest.deleteMany({ where: { email: ourEmail } })

  // AuditLog não tem chave estrangeira: sai por autor e por entidade, antes das entidades.
  await prisma.auditLog.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] },
  })
  // Animais levam amostras, análises, laudo e mídia (cascade); pesquisas levam protocolos e
  // vínculos.
  await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })

  // Glossário: os itens semeados e os criados pela interface têm o nome começando no prefixo
  // da execução, e a chave é derivada do nome (src/lib/slug.ts).
  await prisma.organ.deleteMany({ where: { key: { startsWith: keyPrefix } } })
  // Patógenos antes do grupo da execução (chave estrangeira). Além dos de chave própria, sai
  // qualquer um pendurado num grupo `e2e_…` — o grupo é da suíte, então o que está nele também.
  const groups = await prisma.pathogenGroup.findMany({
    where: { key: { startsWith: keyPrefix } },
    select: { id: true },
  })
  const groupIds = groups.map((g) => g.id)
  await prisma.pathogen.deleteMany({
    where: { OR: [{ key: { startsWith: keyPrefix } }, { groupId: { in: groupIds } }] },
  })
  await prisma.pathogenGroup.deleteMany({ where: { id: { in: groupIds } } })
  await prisma.examType.deleteMany({ where: { key: { startsWith: keyPrefix } } })
  await prisma.necropsySystem.deleteMany({ where: { key: { startsWith: keyPrefix } } })

  for (const id of await authUsers(admin, isOurEmail)) {
    const res = await admin.auth.admin.deleteUser(id)
    if (res.error) throw new Error(`Falha ao remover usuário de teste: ${res.error.message}`)
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

type AnimalExtra = {
  isPublic?: boolean
  lat?: number
  lon?: number
  sex?: string
  eventDate?: string
  municipality?: string
  strandingBeach?: string
  simbaRecordNumber?: string
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
    workAdmin: await user("trabalho-admin", "Admin de Trabalho"),
    workResearcher: await user("trabalho-pesq", "Pesquisadora de Trabalho"),
    workMember: await user("trabalho-membro", "Membro de Trabalho"),
    membersAdmin: await user("membros-admin", "Admin dos Membros"),
    memberPromote: await user("membros-promover", "Membro a Promover"),
    memberRemove: await user("membros-remover", "Membro a Remover"),
    multiOrg: await user("dois-grupos", "Pessoa de Dois Grupos"),
    profileEdit: await user("perfil-editar", "Perfil a Editar"),
    profileDelete: await user("perfil-excluir", "Perfil a Excluir"),
  }

  const org = (name: string) =>
    prisma.organization.create({
      data: { name: `${prefix} ${name}` },
      select: { id: true, name: true },
    })
  const orgA = await org("Grupo A")
  const orgB = await org("Grupo B")
  const orgWork = await org("Grupo de Trabalho")
  const orgMembers = await org("Grupo dos Membros")
  const orgMultiC = await org("Grupo C")
  const orgMultiD = await org("Grupo D")
  const orgProfile = await org("Grupo do Perfil")
  await prisma.membership.createMany({
    data: [
      { userId: users.orgAdmin.id, orgId: orgA.id, role: "ORG_ADMIN" },
      { userId: users.researcher.id, orgId: orgA.id, role: "RESEARCHER" },
      { userId: users.signIn.id, orgId: orgA.id, role: "RESEARCHER" },
      { userId: users.otherOrg.id, orgId: orgB.id, role: "ORG_ADMIN" },
      { userId: users.workAdmin.id, orgId: orgWork.id, role: "ORG_ADMIN" },
      { userId: users.workResearcher.id, orgId: orgWork.id, role: "RESEARCHER" },
      { userId: users.workMember.id, orgId: orgWork.id, role: "RESEARCHER" },
      { userId: users.membersAdmin.id, orgId: orgMembers.id, role: "ORG_ADMIN" },
      { userId: users.memberPromote.id, orgId: orgMembers.id, role: "RESEARCHER" },
      { userId: users.memberRemove.id, orgId: orgMembers.id, role: "RESEARCHER" },
      { userId: users.multiOrg.id, orgId: orgMultiC.id, role: "ORG_ADMIN" },
      { userId: users.multiOrg.id, orgId: orgMultiD.id, role: "ORG_ADMIN" },
      { userId: users.profileEdit.id, orgId: orgProfile.id, role: "ORG_ADMIN" },
      { userId: users.profileDelete.id, orgId: orgProfile.id, role: "RESEARCHER" },
    ],
  })

  // Glossário próprio da execução: a suíte não depende do que estiver semeado, e os rótulos
  // únicos tornam inequívoca a escolha nos seletores do protocolo.
  // Grupo de patógeno PRÓPRIO da execução. Reaproveitar "o primeiro grupo que existir" já fez o
  // setup adotar um grupo temporário de um teste de integração rodando ao mesmo tempo, e os
  // patógenos da suíte pendurados nele quebraram a limpeza daquele teste.
  const groupName = `${prefix} Grupo de patógenos`
  const group = await prisma.pathogenGroup.create({
    data: { key: key("grupo"), name: { pt: groupName, en: groupName }, usesScientificName: true },
  })
  const named = (slug: string, label: string) => ({
    key: key(slug),
    name: { pt: label, en: label },
  })
  const organName = `${prefix} Fígado`
  const organ = await prisma.organ.create({ data: named("figado", organName) })
  const organ2Name = `${prefix} Pulmão`
  const organ2 = await prisma.organ.create({ data: named("pulmao", organ2Name) })
  const pathogenName = `Pathogenus e2e${runId}`
  const pathogen = await prisma.pathogen.create({
    data: {
      key: key("patogeno"),
      groupId: group.id,
      scientificName: pathogenName,
      taxonRank: "species",
    },
  })
  // Rastreio amplo (família) e a espécie que o confirma: a mesma família liga os dois na tela.
  const family = `Broadaceae${runId}`
  const broadName = `Broadaceae e2e${runId}`
  const pathogenBroad = await prisma.pathogen.create({
    data: {
      key: key("familia"),
      groupId: group.id,
      scientificName: broadName,
      taxonRank: "family",
      taxonFamily: family,
    },
  })
  const confirmName = `Broadus confirmatus e2e${runId}`
  const pathogenConfirm = await prisma.pathogen.create({
    data: {
      key: key("especie_confirmada"),
      groupId: group.id,
      scientificName: confirmName,
      taxonRank: "species",
      taxonFamily: family,
    },
  })
  const examName = `${prefix} PCR`
  const examType = await prisma.examType.create({ data: named("pcr", examName) })
  const examMeasuredName = `${prefix} qPCR`
  const measure = `Ct e2e${runId}`
  const examMeasured = await prisma.examType.create({
    data: { ...named("qpcr", examMeasuredName), measureLabel: { pt: measure, en: measure } },
  })
  const system1Name = `${prefix} Sistema respiratório`
  const system1 = await prisma.necropsySystem.create({
    data: named("sistema_respiratorio", system1Name),
  })
  const system2Name = `${prefix} Sistema digestório`
  const system2 = await prisma.necropsySystem.create({
    data: named("sistema_digestorio", system2Name),
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
    extra: AnimalExtra = {},
  ): Promise<E2eAnimal> => {
    const row = await prisma.animal.create({
      data: {
        controlId: `${prefix}-${slug}`,
        simbaRecordNumber: extra.simbaRecordNumber ?? null,
        species,
        sex: extra.sex ?? "M",
        lifeStage: "ADULT",
        eventDate: new Date(`${extra.eventDate ?? "2026-03-10"}T00:00:00Z`),
        municipality: extra.municipality ?? "Florianópolis",
        state: "SC",
        strandingBeach: extra.strandingBeach ?? null,
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

  const protocol = (
    researchId: string,
    organId: string,
    pathogenId: string,
    examTypeId: string,
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) =>
    prisma.researchProtocol.create({
      data: {
        researchId,
        organId,
        pathogenId,
        examTypeId,
        status,
        deactivatedAt: status === "INACTIVE" ? new Date() : null,
      },
    })
  const sample = (
    slug: string,
    animalId: string,
    researchId: string,
    orgId: string,
    createdById: string,
    organId = organ.id,
  ) =>
    prisma.sample.create({
      data: {
        animalId,
        researchId,
        orgId,
        organId,
        identification: `${prefix}-${slug}`,
        sampleType: "tecido fresco",
        createdById,
      },
      select: { id: true, identification: true },
    })
  const analysis = (
    sampleId: string,
    pathogenId: string,
    result: "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO",
    examTypeId = examType.id,
  ) => prisma.analysis.create({ data: { sampleId, pathogenId, examTypeId, result } })

  // Um resultado positivo já lançado, para o dashboard do grupo A ter o que agregar
  // independentemente da ordem em que os demais testes rodam.
  await protocol(shared.id, organ.id, pathogen.id, examType.id)
  const sharedSample = await sample("S1", sharedAnimal.id, shared.id, orgA.id, users.orgAdmin.id)
  await analysis(sharedSample.id, pathogen.id, "POSITIVO")

  // ── Grupo de trabalho ──────────────────────────────────────────────────────────────────
  const W = orgWork.id
  const admin = users.workAdmin.id
  const work = (name: string) => research(name, W, admin)
  const workAnimal = (slug: string, species: string, researchId: string, extra?: AnimalExtra) =>
    animal(slug, species, researchId, W, extra)

  // Laudo (necrópsia), biometria e mídia: um animal por tela, na mesma pesquisa.
  const clinical = await work("Pesquisa do laudo")
  const necropsyAnimal = await workAnimal("NEC", "Necropsius e2e", clinical.id)
  const biometryAnimal = await workAnimal("BIO", "Biometrius e2e", clinical.id)
  const biometrySimba = await workAnimal("BSI", "Biometrius simbae e2e", clinical.id, {
    simbaRecordNumber: `E2E${runId.toUpperCase()}`,
  })
  const mediaAnimal = await workAnimal("MID", "Midius e2e", clinical.id)

  // Lista de animais. `paged`: 23 registros com data, espécie e pesquisa variando de forma
  // conhecida. `removable`: 11 registros para o teste de excluir o único item da última página.
  const list = await work("Pesquisa da lista")
  const listB = await work("Pesquisa da lista B")
  const speciesAlfa = `Listus alfa e2e${runId}`
  const speciesBeta = `Listus beta e2e${runId}`
  const PAGED = 23
  const ALFA = 10
  const IN_RESEARCH_B = 3
  const two = (n: number) => String(n).padStart(2, "0")
  await prisma.animal.createMany({
    data: Array.from({ length: PAGED }, (_, i) => {
      const n = i + 1
      return {
        controlId: `${prefix}-L${two(n)}`,
        species: n <= ALFA ? speciesAlfa : speciesBeta,
        sex: n % 2 === 0 ? "F" : "M",
        lifeStage: "ADULT",
        // L01 → 01/01/2026 … L23 → 23/01/2026.
        eventDate: new Date(`2026-01-${two(n)}T00:00:00Z`),
        municipality: "Laguna",
        state: "SC",
        researchId: n > PAGED - IN_RESEARCH_B ? listB.id : list.id,
        orgId: W,
      }
    }),
  })
  const REMOVABLE = 11
  await prisma.animal.createMany({
    data: Array.from({ length: REMOVABLE }, (_, i) => ({
      controlId: `${prefix}-D${two(i + 1)}`,
      species: `Removibilis e2e${runId}`,
      sex: "M",
      lifeStage: "ADULT",
      // D01 é o mais antigo: na ordenação padrão (data, do mais novo) fica sozinho na página 2.
      eventDate: new Date(`2025-06-${two(i + 1)}T00:00:00Z`),
      municipality: "Imbituba",
      state: "SC",
      researchId: list.id,
      orgId: W,
    })),
  })
  const withSamples = await prisma.animal.findMany({
    where: { orgId: W, controlId: { in: [`${prefix}-L01`, `${prefix}-L02`] } },
    select: { id: true, controlId: true },
  })
  for (const a of withSamples) {
    await sample(`${a.controlId!.slice(prefix.length + 1)}-S`, a.id, list.id, W, admin)
  }

  // Edição: dois animais com todos os campos visíveis diferentes entre si.
  // Pública: o selo do animal só chega a "Publicado" quando a pesquisa também é pública.
  const edit = await research("Pesquisa da edição", W, admin, true)
  const editFirst = await workAnimal("ED1", `Editus primus e2e${runId}`, edit.id, {
    municipality: "Itajaí",
    strandingBeach: "Praia Um",
    sex: "M",
    eventDate: "2026-02-01",
  })
  const editSecond = await workAnimal("ED2", `Editus secundus e2e${runId}`, edit.id, {
    municipality: "Garopaba",
    strandingBeach: "Praia Dois",
    sex: "F",
    eventDate: "2026-02-02",
  })

  // Amostras: uma livre para editar e excluir, outra com análise lançada (exclusão bloqueada).
  const samplesResearch = await work("Pesquisa das amostras")
  await protocol(samplesResearch.id, organ.id, pathogen.id, examType.id)
  const samplesAnimal = await workAnimal("AMO", "Amostrius e2e", samplesResearch.id)
  const editable = await sample("AMO-LIVRE", samplesAnimal.id, samplesResearch.id, W, admin)
  const locked = await sample("AMO-ANALISADA", samplesAnimal.id, samplesResearch.id, W, admin)
  await analysis(locked.id, pathogen.id, "NEGATIVO")

  // Análises: uma linha com medida quantitativa e uma de rastreio amplo (pede confirmação).
  const analysesResearch = await work("Pesquisa das análises")
  await protocol(analysesResearch.id, organ.id, pathogen.id, examMeasured.id)
  await protocol(analysesResearch.id, organ.id, pathogenBroad.id, examType.id)
  const analysesAnimal = await workAnimal("ANA", "Analisius e2e", analysesResearch.id)
  const analysesSample = await sample("ANA-S", analysesAnimal.id, analysesResearch.id, W, admin)

  // Resultados: um animal por desfecho no teste ativo, e uma entrada INATIVA com resultado
  // antigo, que só aparece com "mostrar inativos".
  const results = await work("Pesquisa dos resultados")
  await protocol(results.id, organ.id, pathogen.id, examType.id)
  await protocol(results.id, organ.id, pathogenBroad.id, examType.id, "INACTIVE")
  const positive = await workAnimal("RES-POS", "Resultus positivus e2e", results.id)
  const negative = await workAnimal("RES-NEG", "Resultus negativus e2e", results.id)
  const untested = await workAnimal("RES-NT", "Resultus intactus e2e", results.id)
  const positiveSample = await sample("RES-POS-S", positive.id, results.id, W, admin)
  const negativeSample = await sample("RES-NEG-S", negative.id, results.id, W, admin)
  await sample("RES-NT-S", untested.id, results.id, W, admin)
  await analysis(positiveSample.id, pathogen.id, "POSITIVO")
  await analysis(negativeSample.id, pathogen.id, "NEGATIVO")
  await analysis(positiveSample.id, pathogenBroad.id, "INCONCLUSIVO")
  // Com protocolo e sem nenhum animal: o estado "nenhum animal com amostras" da grade.
  const resultsNoAnimals = await work("Pesquisa sem animais")
  await protocol(resultsNoAnimals.id, organ.id, pathogen.id, examType.id)

  // Gestão da pesquisa: protocolo com duas entradas (uma para desativar, outra para excluir)
  // e uma pesquisa vazia para a exclusão.
  const manage = await work("Pesquisa a gerir")
  await protocol(manage.id, organ.id, pathogen.id, examType.id)
  await protocol(manage.id, organ2.id, pathogen.id, examType.id)
  const empty = await work("Pesquisa vazia")

  // Compartilhamento: a pesquisadora participa só da origem — por isso o convite à pesquisa de
  // destino nasce pendente e depende do outro lado.
  const origin = await work("Pesquisa de origem")
  const target = await work("Pesquisa de destino")
  await prisma.researchMember.create({
    data: { researchId: origin.id, userId: users.workResearcher.id },
  })
  const shareAccept = await workAnimal("CMP-ACEITO", "Compartilhus acceptus e2e", origin.id)
  const shareCancel = await workAnimal("CMP-CANCELADO", "Compartilhus cancelatus e2e", origin.id)
  const shareReject = await workAnimal("CMP-RECUSADO", "Compartilhus recusatus e2e", origin.id)

  // ── Demais grupos ──────────────────────────────────────────────────────────────────────
  // Membros: o grupo tem dados (uma pesquisa), o que impede o único admin de sair.
  await research("Pesquisa dos membros", orgMembers.id, users.membersAdmin.id)

  // Dois grupos: um animal em cada, para a troca de grupo ativo mudar a lista.
  const researchC = await research("Pesquisa do grupo C", orgMultiC.id, users.multiOrg.id)
  const researchD = await research("Pesquisa do grupo D", orgMultiD.id, users.multiOrg.id)
  const animalC = await animal("GC1", "Grupus ce e2e", researchC.id, orgMultiC.id)
  const animalD = await animal("GD1", "Grupus de e2e", researchD.id, orgMultiD.id)

  return {
    runId,
    prefix,
    password,
    users,
    orgs: {
      a: orgA,
      b: orgB,
      work: orgWork,
      members: orgMembers,
      multiC: orgMultiC,
      multiD: orgMultiD,
      profile: orgProfile,
    },
    catalog: {
      organ: { id: organ.id, label: organName },
      pathogen: { id: pathogen.id, label: pathogenName },
      examType: { id: examType.id, label: examName },
      organ2: { id: organ2.id, label: organ2Name },
      pathogenBroad: { id: pathogenBroad.id, label: broadName },
      pathogenConfirm: { id: pathogenConfirm.id, label: confirmName },
      examMeasured: { id: examMeasured.id, label: examMeasuredName, measure },
      systems: [
        { id: system1.id, label: system1Name },
        { id: system2.id, label: system2Name },
      ],
    },
    research: { shared, restricted, publicMap, orgB: orgBResearch },
    animals: {
      shared: sharedAnimal,
      restricted: restrictedAnimal,
      mapPublic,
      mapHidden,
      orgB: orgBAnimal,
    },
    work: {
      clinical: {
        research: clinical,
        necropsy: necropsyAnimal,
        biometry: biometryAnimal,
        biometrySimba,
        media: mediaAnimal,
      },
      list: {
        research: list,
        researchB: listB,
        paged: {
          prefix: `${prefix}-L`,
          count: PAGED,
          inResearchB: IN_RESEARCH_B,
          withSamples: withSamples.length,
        },
        removable: { prefix: `${prefix}-D`, count: REMOVABLE },
        speciesAlfa: { name: speciesAlfa, count: ALFA },
        speciesBeta: { name: speciesBeta, count: PAGED - ALFA },
      },
      edit: {
        research: edit,
        first: { ...editFirst, municipality: "Itajaí" },
        second: { ...editSecond, municipality: "Garopaba" },
      },
      samples: {
        research: samplesResearch,
        animal: samplesAnimal,
        editable: editable.identification,
        locked: locked.identification,
      },
      analyses: {
        research: analysesResearch,
        animal: analysesAnimal,
        sample: analysesSample.identification,
      },
      results: { research: results, noAnimals: resultsNoAnimals, positive, negative, untested },
      manage: { research: manage, empty },
      sharing: {
        origin,
        target,
        accept: shareAccept,
        cancel: shareCancel,
        reject: shareReject,
      },
    },
    multi: {
      c: { research: researchC, animal: animalC },
      d: { research: researchD, animal: animalD },
    },
  }
}
