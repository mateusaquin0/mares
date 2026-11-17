import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/auth"
import { MEDIA_BUCKET } from "@/lib/media"
import { login, member, systemAdmin } from "./route"
import { createAdminClient } from "./supabase-fake"

// Cenário compartilhado pelos testes de rota do domínio "animal e seus dados"
// (routes-animals, -samples, -analyses, -media, -animal-share, -biometry, -necropsy).
//
// Cada arquivo monta o SEU mundo, com sufixo único, e o desmonta no afterAll:
//   • organização A com duas pesquisas (P e Q) e a organização B com uma (para "outra org");
//   • um usuário por papel que as regras de acesso distinguem;
//   • catálogo próprio (órgãos, patógenos, exames, sistemas) — não depende do seed.
//
// Todos os ids nascem ANTES de qualquer gravação: se o seed parar no meio, a limpeza ainda
// filtra por ids concretos — nunca por `undefined`, que alcançaria a tabela inteira.

type Role = "RESEARCHER" | "ORG_ADMIN"

export type World = ReturnType<typeof newWorld>

export function newWorld(prefix: string) {
  const tag = randomUUID().slice(0, 8)
  const orgA = randomUUID()
  const orgB = randomUUID()
  const users = {
    adminA: randomUUID(), // admin da org A
    resP: randomUUID(), // pesquisador vinculado só à pesquisa P
    resP2: randomUUID(), // segundo pesquisador da pesquisa P (autoria × colega)
    resQ: randomUUID(), // pesquisador vinculado só à pesquisa Q
    resPQ: randomUUID(), // pesquisador vinculado a P e a Q
    outsider: randomUUID(), // pesquisador da org A sem pesquisa alguma
    adminB: randomUUID(), // admin de OUTRA organização
    sysAdmin: randomUUID(), // admin global, sem organização
  }
  const as = (id: string, orgId: string, role: Role): AuthUser => member(id, [orgId, role])
  return {
    prefix,
    tag,
    orgA,
    orgB,
    users,
    as: {
      adminA: as(users.adminA, orgA, "ORG_ADMIN"),
      resP: as(users.resP, orgA, "RESEARCHER"),
      resP2: as(users.resP2, orgA, "RESEARCHER"),
      resQ: as(users.resQ, orgA, "RESEARCHER"),
      resPQ: as(users.resPQ, orgA, "RESEARCHER"),
      outsider: as(users.outsider, orgA, "RESEARCHER"),
      adminB: as(users.adminB, orgB, "ORG_ADMIN"),
      sysAdmin: systemAdmin(users.sysAdmin),
    },
    researchP: randomUUID(),
    researchQ: randomUUID(),
    researchB: randomUUID(), // pesquisa da org B
    groupId: randomUUID(),
    organId: randomUUID(),
    organ2Id: randomUUID(),
    pathogenId: randomUUID(), // alvo de rastreio, no protocolo de P e de Q
    speciesId: randomUUID(), // espécie usada nas confirmações (fora do protocolo)
    species2Id: randomUUID(),
    examId: randomUUID(), // exame de rastreio, no protocolo
    seqExamId: randomUUID(), // exame de sequenciamento (fora do protocolo)
    systemId: randomUUID(),
    system2Id: randomUUID(),
    // Nomes legíveis e únicos por execução.
    name: (what: string) => `${prefix} ${what} ${tag}`,
    key: (what: string) => `${prefix}_${what}_${tag}`.toLowerCase(),
    seq: 0,
  }
}

export async function seedWorld(w: World) {
  const i18n = (what: string) => ({ pt: w.name(what), en: w.name(what) })

  await prisma.organization.createMany({
    data: [
      { id: w.orgA, name: w.name("Org A") },
      { id: w.orgB, name: w.name("Org B") },
    ],
  })
  await prisma.user.createMany({
    data: Object.entries(w.users).map(([role, id]) => ({
      id,
      email: `${w.key(role)}@test.local`,
      name: w.name(role),
      isSystemAdmin: role === "sysAdmin",
    })),
  })
  const inA = (userId: string, role: Role) => ({ userId, orgId: w.orgA, role })
  await prisma.membership.createMany({
    data: [
      inA(w.users.adminA, "ORG_ADMIN"),
      inA(w.users.resP, "RESEARCHER"),
      inA(w.users.resP2, "RESEARCHER"),
      inA(w.users.resQ, "RESEARCHER"),
      inA(w.users.resPQ, "RESEARCHER"),
      inA(w.users.outsider, "RESEARCHER"),
      { userId: w.users.adminB, orgId: w.orgB, role: "ORG_ADMIN" },
    ],
  })

  // `usesScientificName: false` de propósito: o seed da suíte ponta a ponta adota o primeiro
  // grupo com `true` que encontrar no banco. Se as duas suítes rodam ao mesmo tempo, ele pendura
  // os patógenos dele neste grupo temporário e a limpeza daqui esbarra na chave estrangeira.
  // As rotas deste domínio não leem o campo.
  await prisma.pathogenGroup.create({
    data: { id: w.groupId, key: w.key("grp"), name: i18n("grp"), usesScientificName: false },
  })
  await prisma.organ.createMany({
    data: [
      { id: w.organId, key: w.key("organ"), name: i18n("organ") },
      { id: w.organ2Id, key: w.key("organ2"), name: i18n("organ2") },
    ],
  })
  await prisma.pathogen.createMany({
    data: [
      { id: w.pathogenId, key: w.key("pat"), groupId: w.groupId, scientificName: w.name("Pat") },
      { id: w.speciesId, key: w.key("sp"), groupId: w.groupId, scientificName: w.name("Sp") },
      { id: w.species2Id, key: w.key("sp2"), groupId: w.groupId, scientificName: w.name("Sp2") },
    ],
  })
  await prisma.examType.createMany({
    data: [
      { id: w.examId, key: w.key("exam"), name: i18n("exam") },
      { id: w.seqExamId, key: w.key("seq"), name: i18n("seq") },
    ],
  })
  await prisma.necropsySystem.createMany({
    data: [
      { id: w.systemId, key: w.key("sys"), name: i18n("sys") },
      { id: w.system2Id, key: w.key("sys2"), name: i18n("sys2") },
    ],
  })

  const combo = { organId: w.organId, pathogenId: w.pathogenId, examTypeId: w.examId }
  await prisma.research.create({
    data: {
      id: w.researchP,
      name: w.name("Pesquisa P"),
      orgId: w.orgA,
      isPublic: true,
      members: {
        create: [{ userId: w.users.resP }, { userId: w.users.resP2 }, { userId: w.users.resPQ }],
      },
      protocols: { create: combo },
    },
  })
  await prisma.research.create({
    data: {
      id: w.researchQ,
      name: w.name("Pesquisa Q"),
      orgId: w.orgA,
      members: { create: [{ userId: w.users.resQ }, { userId: w.users.resPQ }] },
      protocols: { create: combo },
    },
  })
  await prisma.research.create({
    data: { id: w.researchB, name: w.name("Pesquisa B"), orgId: w.orgB },
  })
}

/** Remove tudo que o mundo criou — sempre por ids/orgIds dele. */
export async function destroyWorld(w: World) {
  const orgIds = [w.orgA, w.orgB]
  const userIds = Object.values(w.users)
  const pathogenIds = [w.pathogenId, w.speciesId, w.species2Id]
  // Na ordem das chaves estrangeiras. Cada passo roda mesmo que um anterior falhe — uma falha
  // no meio não pode deixar o resto do mundo para trás — e a falha é relatada no fim.
  const steps: [string, () => Promise<unknown>][] = [
    // AuditLog não tem FK: sai pelo autor (toda escrita dos testes é de usuários do mundo).
    ["AuditLog", () => prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } })],
    ["Sample", () => prisma.sample.deleteMany({ where: { orgId: { in: orgIds } } })],
    [
      "AnimalMedia",
      () => prisma.animalMedia.deleteMany({ where: { research: { orgId: { in: orgIds } } } }),
    ],
    ["Animal", () => prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })],
    ["Research", () => prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })],
    ["Membership", () => prisma.membership.deleteMany({ where: { orgId: { in: orgIds } } })],
    ["User", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["Organization", () => prisma.organization.deleteMany({ where: { id: { in: orgIds } } })],
    ["Pathogen", () => prisma.pathogen.deleteMany({ where: { id: { in: pathogenIds } } })],
    [
      "PathogenGroup",
      () => prisma.pathogenGroup.deleteMany({ where: { id: { in: [w.groupId] } } }),
    ],
    [
      "ExamType",
      () => prisma.examType.deleteMany({ where: { id: { in: [w.examId, w.seqExamId] } } }),
    ],
    ["Organ", () => prisma.organ.deleteMany({ where: { id: { in: [w.organId, w.organ2Id] } } })],
    [
      "NecropsySystem",
      () => prisma.necropsySystem.deleteMany({ where: { id: { in: [w.systemId, w.system2Id] } } }),
    ],
  ]
  const failed: string[] = []
  for (const [table, run] of steps) {
    try {
      await run()
    } catch (err) {
      failed.push(`${table}: ${err instanceof Error ? err.message.trim() : String(err)}`)
    }
  }
  await prisma.$disconnect()
  if (failed.length > 0) {
    throw new Error(
      `Limpeza do mundo "${w.prefix} ${w.tag}" incompleta — sobrou dado no banco de testes:\n` +
        failed.join("\n"),
    )
  }
}

// ── Fábricas ─────────────────────────────────────────────────────────────────

const orgOf = (w: World, researchId: string) => (researchId === w.researchB ? w.orgB : w.orgA)

/** Indivíduo com ID de controle único. A pesquisa informada é a PRIMÁRIA. */
export async function makeAnimal(
  w: World,
  researchId: string,
  over: Partial<Prisma.AnimalUncheckedCreateInput> = {},
) {
  const controlId = `${w.prefix}-${w.tag}-${++w.seq}`
  const animal = await prisma.animal.create({
    data: {
      researchId,
      orgId: orgOf(w, researchId),
      controlId,
      species: "Sotalia guianensis",
      sex: "F",
      lifeStage: "ADULT",
      ...over,
    },
    select: { id: true, controlId: true },
  })
  return { id: animal.id, controlId: animal.controlId ?? controlId }
}

/** Participação de outra pesquisa no indivíduo (aceita, salvo `status`). */
export async function makeShare(
  animalId: string,
  researchId: string,
  over: Partial<Prisma.AnimalResearchUncheckedCreateInput> = {},
) {
  await prisma.animalResearch.create({ data: { animalId, researchId, ...over } })
}

/** Amostra da pesquisa informada (dona), no órgão do protocolo salvo `organId`. */
export async function makeSample(
  w: World,
  animalId: string,
  researchId: string,
  over: Partial<Prisma.SampleUncheckedCreateInput> = {},
) {
  const sample = await prisma.sample.create({
    data: {
      animalId,
      researchId,
      orgId: orgOf(w, researchId),
      organId: w.organId,
      identification: `${w.tag}-AM-${++w.seq}`,
      sampleType: "Tecido",
      ...over,
    },
    select: { id: true, identification: true },
  })
  return sample
}

/** Rastreio (parentAnalysisId nulo) do patógeno/exame do protocolo. */
export async function makeScreening(
  w: World,
  sampleId: string,
  result: "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO",
) {
  const analysis = await prisma.analysis.create({
    data: { sampleId, pathogenId: w.pathogenId, examTypeId: w.examId, result },
    select: { id: true },
  })
  return analysis.id
}

/** Arquivo de mídia: linha no banco + objeto no Storage falso. */
export async function makeMedia(
  animalId: string,
  researchId: string,
  uploadedById: string | null,
  label: string | null = null,
) {
  const path = `${animalId}/${randomUUID()}_foto.png`
  await createAdminClient().storage.from(MEDIA_BUCKET).upload(path, PNG_BYTES, {
    contentType: "image/png",
  })
  const media = await prisma.animalMedia.create({
    data: { animalId, researchId, url: path, mimeType: "image/png", label, uploadedById },
    select: { id: true },
  })
  return { id: media.id, path }
}

// Conteúdos mínimos com os magic bytes que src/lib/media.ts confere.
export const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
export const PDF_BYTES = Buffer.from("%PDF-1.4\n%teste\n")

// ── Acesso ───────────────────────────────────────────────────────────────────

/**
 * Chama a rota com quem NÃO deveria alcançar o recurso da org A e devolve os status, na ordem:
 * sem sessão, admin de outra organização, pesquisador da org A sem vínculo com pesquisa alguma.
 * O esperado, em todas as rotas deste domínio, é [401, 403, 403].
 */
export async function deniedStatuses(w: World, call: () => Promise<Response>): Promise<number[]> {
  const out: number[] = []
  for (const user of [null, w.as.adminB, w.as.outsider]) {
    login(user)
    out.push((await call()).status)
  }
  return out
}

export const DENIED = [401, 403, 403]

/** Linhas de auditoria de uma entidade, da mais antiga para a mais nova. */
export async function auditOf(entity: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { changedAt: "asc" },
    select: { field: true, oldValue: true, newValue: true, userId: true },
  })
}
