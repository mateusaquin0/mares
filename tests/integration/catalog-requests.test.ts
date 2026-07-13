import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  createCatalogRequest,
  approveCatalogRequest,
  rejectCatalogRequest,
} from "@/lib/catalog-requests"
import { ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

// Fase 2 — integração contra um Postgres real. Cobre o fluxo de solicitação de glossário:
// aprovar cria o item; duplicata auto-rejeita; autor não revisa a própria; rejeição registra.
// Usa as funções reais de src/lib/catalog-requests.

const tag = randomUUID().slice(0, 8)
let requesterId: string
const requesterEmail = `requester-${tag}@test.local`

beforeAll(async () => {
  requesterId = randomUUID()
  await prisma.user.create({ data: { id: requesterId, email: requesterEmail } })
})

afterAll(async () => {
  await prisma.catalogRequest.deleteMany({ where: { requestedById: requesterId } })
  await prisma.organ.deleteMany({ where: { createdById: requesterId } })
  await prisma.organ.deleteMany({ where: { key: { startsWith: `dup_${tag}` } } })
  await prisma.user.deleteMany({ where: { id: requesterId } })
  await prisma.$disconnect()
})

async function openRequest(namePt: string, nameEn: string) {
  return createCatalogRequest({
    type: "organs",
    payload: { namePt, nameEn },
    userId: requesterId,
    userEmail: requesterEmail,
    orgId: null,
    orgName: null,
  })
}

describe("Aprovação cria o item", () => {
  it("aprovar uma solicitação pendente cria o órgão e marca APPROVED", async () => {
    const req = await openRequest(`Órgão ${tag}`, `Organ ${tag}`)
    expect(req.status).toBe("PENDING")

    const { createdItemId } = await approveCatalogRequest(req.id, randomUUID())
    const organ = await prisma.organ.findUnique({ where: { id: createdItemId } })
    expect(organ).not.toBeNull()
    expect(organ?.createdById).toBe(requesterId) // o solicitante fica dono do item

    const after = await prisma.catalogRequest.findUnique({ where: { id: req.id } })
    expect(after?.status).toBe("APPROVED")
    expect(after?.createdItemId).toBe(createdItemId)
  })
})

describe("Duplicata auto-rejeita", () => {
  it("aprovar item cujo nome já existe rejeita como duplicata e aponta o canônico", async () => {
    const existing = await prisma.organ.create({
      data: { key: `dup_${tag}`, name: { pt: `Baço ${tag}`, en: `Spleen ${tag}` } },
      select: { id: true },
    })
    const req = await openRequest(`Baço ${tag}`, `Spleen ${tag}`)

    await expect(approveCatalogRequest(req.id, randomUUID())).rejects.toMatchObject({
      code: ERROR_CODES.catalogDuplicate,
    })

    const after = await prisma.catalogRequest.findUnique({ where: { id: req.id } })
    expect(after?.status).toBe("REJECTED")
    expect(after?.duplicateOfId).toBe(existing.id)
  })
})

describe("Integridade da curadoria", () => {
  it("o autor não pode aprovar a própria solicitação", async () => {
    const req = await openRequest(`Auto ${tag}`, `Self ${tag}`)
    await expect(approveCatalogRequest(req.id, requesterId)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("rejeitar registra motivo e bloqueia reprocessamento", async () => {
    const req = await openRequest(`Rejeita ${tag}`, `Reject ${tag}`)
    await rejectCatalogRequest(req.id, randomUUID(), "fora de escopo")
    const after = await prisma.catalogRequest.findUnique({ where: { id: req.id } })
    expect(after?.status).toBe("REJECTED")
    expect(after?.reviewNote).toBe("fora de escopo")

    await expect(rejectCatalogRequest(req.id, randomUUID(), null)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it("bloqueia solicitação pendente idêntica do mesmo autor", async () => {
    await openRequest(`Repetido ${tag}`, `Repeat ${tag}`)
    await expect(openRequest(`Repetido ${tag}`, `Repeat ${tag}`)).rejects.toMatchObject({
      code: ERROR_CODES.catalogRequestDuplicatePending,
    })
  })
})
