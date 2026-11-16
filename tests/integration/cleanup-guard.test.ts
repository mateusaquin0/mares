import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"

// A trava de tests/integration/setup.ts protege o banco de testes, que também guarda os dados
// fictícios de demonstração: limpeza sem filtro efetivo não pode chegar ao banco.

afterAll(async () => {
  await prisma.$disconnect()
})

describe("Trava de limpeza dos testes de integração", () => {
  it("recusa deleteMany com id indefinido (setup interrompido)", async () => {
    const organId = undefined as unknown as string
    const before = await prisma.organ.count()
    await expect(prisma.organ.deleteMany({ where: { id: organId } })).rejects.toThrow(/recusado/)
    expect(await prisma.organ.count()).toBe(before)
  })

  it("recusa deleteMany e updateMany sem filtro", async () => {
    await expect(prisma.organ.deleteMany({})).rejects.toThrow(/recusado/)
    await expect(prisma.organ.deleteMany({ where: {} })).rejects.toThrow(/recusado/)
    await expect(prisma.organ.updateMany({ where: {}, data: {} })).rejects.toThrow(/recusado/)
  })

  it("recusa undefined dentro de filtro aninhado ou de lista", async () => {
    const orgId = undefined as unknown as string
    await expect(prisma.sample.deleteMany({ where: { animal: { orgId } } })).rejects.toThrow(
      /recusado/,
    )
    await expect(prisma.organ.deleteMany({ where: { id: { in: [orgId] } } })).rejects.toThrow(
      /recusado/,
    )
  })

  it("deixa passar o filtro com valor definido", async () => {
    const result = await prisma.organ.deleteMany({ where: { id: "id-que-nao-existe" } })
    expect(result.count).toBe(0)
  })
})
