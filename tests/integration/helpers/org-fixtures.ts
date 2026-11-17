import { randomUUID } from "node:crypto"
import type { MembershipRole, UserStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/auth"
import { login } from "./route"

// Dados de apoio dos testes de rota fora do domínio "animal" (pesquisas, grupos, glossário,
// feedback, administração). O banco de testes é o MESMO dos dados fictícios de demonstração:
// tudo o que um arquivo cria fica registrado aqui e é removido por id no `cleanup()` — nenhum
// filtro amplo, nenhuma linha alheia.

export type Fixtures = ReturnType<typeof createFixtures>

export function createFixtures(prefix: string) {
  const tag = randomUUID().slice(0, 8)

  const tracked = {
    orgs: new Set<string>(),
    orgNames: new Set<string>(),
    users: new Set<string>(),
    emails: new Set<string>(),
    feedbacks: new Set<string>(),
    catalogRequests: new Set<string>(),
    joinRequests: new Set<string>(),
    organs: new Set<string>(),
    pathogens: new Set<string>(),
    examTypes: new Set<string>(),
    systems: new Set<string>(),
    groups: new Set<string>(),
  }

  let seq = 0
  const unique = (label: string) => `${prefix} ${label} ${tag} ${++seq}`

  async function org(label = "Org", data: { deactivatedAt?: Date } = {}): Promise<string> {
    const name = unique(label)
    const { id } = await prisma.organization.create({
      data: { name, ...data },
      select: { id: true },
    })
    tracked.orgs.add(id)
    tracked.orgNames.add(name)
    return id
  }

  /** Usuário local (o id é o do Supabase Auth, por isso UUID). E-mail = `<id>@test.local`. */
  async function user(
    opts: {
      name?: string | null
      status?: UserStatus
      isSystemAdmin?: boolean
      memberships?: [string, MembershipRole][]
    } = {},
  ): Promise<string> {
    const id = randomUUID()
    const email = `${id}@test.local`
    await prisma.user.create({
      data: {
        id,
        email,
        name: opts.name === undefined ? `Teste ${tag}` : opts.name,
        status: opts.status ?? "ACTIVE",
        isSystemAdmin: opts.isSystemAdmin ?? false,
      },
    })
    tracked.users.add(id)
    tracked.emails.add(email)
    for (const [orgId, role] of opts.memberships ?? []) {
      await prisma.membership.create({ data: { userId: id, orgId, role } })
    }
    return id
  }

  async function research(
    orgId: string,
    opts: { createdById?: string; members?: string[]; isPublic?: boolean; name?: string } = {},
  ): Promise<string> {
    const { id } = await prisma.research.create({
      data: {
        name: opts.name ?? unique("Pesquisa"),
        orgId,
        isPublic: opts.isPublic ?? false,
        createdById: opts.createdById ?? null,
        members: { create: (opts.members ?? []).map((userId) => ({ userId })) },
      },
      select: { id: true },
    })
    return id
  }

  /** Itens de glossário próprios do teste (nomes únicos por execução — há índices únicos). */
  async function catalog() {
    const n = ++seq
    const label = (kind: string) =>
      `${kind}_${prefix}_${tag}_${n}`.toLowerCase().replace(/\W+/g, "_")
    const group = await prisma.pathogenGroup.create({
      data: { key: label("grp"), name: { pt: label("grp"), en: label("grp") } },
      select: { id: true },
    })
    tracked.groups.add(group.id)
    const organ = await prisma.organ.create({
      data: { key: label("organ"), name: { pt: label("organ"), en: label("organ") } },
      select: { id: true },
    })
    tracked.organs.add(organ.id)
    const pathogen = await prisma.pathogen.create({
      data: {
        key: label("pathogen"),
        groupId: group.id,
        scientificName: `Pathogenus ${label("sp")}`,
      },
      select: { id: true },
    })
    tracked.pathogens.add(pathogen.id)
    const examType = await prisma.examType.create({
      data: { key: label("exam"), name: { pt: label("exam"), en: label("exam") } },
      select: { id: true },
    })
    tracked.examTypes.add(examType.id)
    return {
      groupId: group.id,
      organId: organ.id,
      pathogenId: pathogen.id,
      examTypeId: examType.id,
    }
  }

  async function animal(
    orgId: string,
    researchId: string,
    data: { controlId?: string; isPublic?: boolean; species?: string; primaryHiddenAt?: Date } = {},
  ) {
    const controlId = data.controlId ?? `${prefix}-${tag}-${++seq}`
    const { id } = await prisma.animal.create({
      data: {
        orgId,
        researchId,
        controlId,
        species: data.species ?? "Sotalia guianensis",
        isPublic: data.isPublic ?? false,
        primaryHiddenAt: data.primaryHiddenAt ?? null,
        eventDate: new Date("2026-03-10T00:00:00.000Z"),
      },
      select: { id: true },
    })
    return { id, controlId }
  }

  async function sample(orgId: string, researchId: string, animalId: string, organId: string) {
    const { id } = await prisma.sample.create({
      data: {
        orgId,
        researchId,
        animalId,
        organId,
        identification: `${prefix}-${tag}-AM-${++seq}`,
        sampleType: "Tecido",
      },
      select: { id: true },
    })
    return id
  }

  /** Sessão igual à que `getAuthUser` montaria: papéis e vínculos lidos do banco. */
  async function authUser(userId: string): Promise<AuthUser> {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        memberships: {
          select: { orgId: true, role: true, organization: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      isSystemAdmin: u.isSystemAdmin,
      memberships: u.memberships.map((m) => ({
        orgId: m.orgId,
        orgName: m.organization.name,
        role: m.role,
      })),
    }
  }

  /** Entra como o usuário (estado atual do banco). `activeOrgId` como em `login`. */
  async function as(userId: string, activeOrgId?: string | null): Promise<AuthUser> {
    const u = await authUser(userId)
    login(u, activeOrgId)
    return u
  }

  async function cleanup() {
    login(null)
    const emails = [...tracked.emails]
    // Usuários criados pelas rotas (convites) só são conhecidos pelo e-mail.
    const byEmail = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    })
    const userIds = [...new Set([...tracked.users, ...byEmail.map((u) => u.id)])]
    // Grupos criados pela aprovação de solicitação: o nome é único da execução.
    const byName = await prisma.organization.findMany({
      where: { name: { in: [...tracked.orgNames] } },
      select: { id: true },
    })
    const orgIds = [...new Set([...tracked.orgs, ...byName.map((o) => o.id)])]

    const analyses = await prisma.analysis.findMany({
      where: { sample: { orgId: { in: orgIds } } },
      select: { id: true },
    })
    const animals = await prisma.animal.findMany({
      where: { orgId: { in: orgIds } },
      select: { id: true },
    })
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { entityId: { in: [...analyses.map((a) => a.id), ...animals.map((a) => a.id)] } },
        ],
      },
    })

    await prisma.feedback.deleteMany({
      where: { OR: [{ id: { in: [...tracked.feedbacks] } }, { createdById: { in: userIds } }] },
    })
    await prisma.catalogRequest.deleteMany({
      where: {
        OR: [{ id: { in: [...tracked.catalogRequests] } }, { requestedById: { in: userIds } }],
      },
    })
    await prisma.joinRequest.deleteMany({
      where: { OR: [{ id: { in: [...tracked.joinRequests] } }, { email: { in: emails } }] },
    })

    await prisma.analysis.deleteMany({ where: { sample: { orgId: { in: orgIds } } } })
    await prisma.sample.deleteMany({ where: { orgId: { in: orgIds } } })
    await prisma.animalMedia.deleteMany({ where: { research: { orgId: { in: orgIds } } } })
    await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
    await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
    await prisma.membership.deleteMany({
      where: { OR: [{ orgId: { in: orgIds } }, { userId: { in: userIds } }] },
    })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })

    // Glossário: os itens registrados + os criados pelas rotas em nome dos usuários do teste.
    const mine = (ids: Set<string>) => ({
      OR: [{ id: { in: [...ids] } }, { createdById: { in: userIds } }],
    })
    await prisma.pathogen.deleteMany({ where: mine(tracked.pathogens) })
    await prisma.examType.deleteMany({ where: mine(tracked.examTypes) })
    await prisma.organ.deleteMany({ where: mine(tracked.organs) })
    await prisma.necropsySystem.deleteMany({ where: mine(tracked.systems) })
    await prisma.pathogenGroup.deleteMany({ where: { id: { in: [...tracked.groups] } } })
  }

  return {
    tag,
    tracked,
    unique,
    org,
    user,
    research,
    catalog,
    animal,
    sample,
    authUser,
    as,
    cleanup,
  }
}
