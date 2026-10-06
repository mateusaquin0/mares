import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Unicidade da identificação da amostra contra um Postgres real (migration
// 20260820000000_sample_identification_unique_per_research).
//
// Cenário que estes testes protegem: o rótulo do tubo vem do indivíduo ("150/23 FIG" = ID de
// controle + órgão). Num indivíduo COMPARTILHADO, as duas pesquisas chegam ao mesmo rótulo
// para as suas próprias amostras — e, enquanto a unicidade era por ORGANIZAÇÃO, a segunda
// pesquisa era recusada por uma amostra que sequer enxerga (bug reportado: 150/23 FIG).

let orgId: string
let rPrimaria: string // pesquisa dona do indivíduo
let rParticipante: string // pesquisa que recebeu o indivíduo compartilhado
let organId: string
let animalId: string

const FIG = "150/23 FIG (test)"

function createSample(researchId: string, identification: string) {
  return prisma.sample.create({
    data: { animalId, researchId, organId, orgId, identification, sampleType: "Tecido" },
    select: { id: true },
  })
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { name: "Org identificação (test)" },
      select: { id: true },
    })
  ).id
  rPrimaria = (
    await prisma.research.create({
      data: { name: "R primária (test)", orgId },
      select: { id: true },
    })
  ).id
  rParticipante = (
    await prisma.research.create({
      data: { name: "R participante (test)", orgId },
      select: { id: true },
    })
  ).id
  organId = (
    await prisma.organ.create({
      data: { key: "organ_test_ident", name: { pt: "Fígado", en: "Liver" } },
      select: { id: true },
    })
  ).id
  animalId = (
    await prisma.animal.create({
      data: { species: "Sotalia guianensis", researchId: rPrimaria, orgId },
      select: { id: true },
    })
  ).id
  // Compartilhamento aceito: é o que põe as duas pesquisas sobre o mesmo indivíduo.
  await prisma.animalResearch.create({
    data: { animalId, researchId: rParticipante, status: "ACCEPTED" },
  })
})

afterAll(async () => {
  await prisma.sample.deleteMany({ where: { orgId } })
  await prisma.animalResearch.deleteMany({ where: { animalId } })
  await prisma.animal.deleteMany({ where: { orgId } })
  await prisma.research.deleteMany({ where: { orgId } })
  await prisma.organization.deleteMany({ where: { id: orgId } })
  await prisma.organ.deleteMany({ where: { id: organId } })
  await prisma.$disconnect()
})

describe("Identificação da amostra — única por PESQUISA", () => {
  it("aceita o mesmo rótulo em outra pesquisa do mesmo indivíduo", async () => {
    const daPrimaria = await createSample(rPrimaria, FIG)
    const daParticipante = await createSample(rParticipante, FIG)

    expect(daPrimaria.id).not.toBe(daParticipante.id)
    expect(await prisma.sample.count({ where: { orgId, identification: FIG } })).toBe(2)
  })

  it("recusa o mesmo rótulo repetido dentro da MESMA pesquisa", async () => {
    await createSample(rPrimaria, "150/23 PUL (test)")

    // P2002 é o que a rota converte em sampleDuplicateError (409) — ver src/lib/samples.ts.
    const err = await createSample(rPrimaria, "150/23 PUL (test)").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe("P2002")
  })
})
