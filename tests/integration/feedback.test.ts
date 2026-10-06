import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { listMyFeedback, updateFeedback, updateMyFeedback } from "@/lib/feedback"
import { ERROR_CODES } from "@/lib/error-codes"

// Integração contra um Postgres real. Cobre as duas regras do fluxo de feedback:
//   1. descartar (WONT_FIX) exige justificativa — inclusive ao tentar apagá-la depois;
//   2. o autor lê os próprios envios SEM a anotação interna do admin.
// Usa as funções reais de src/lib/feedback.

const tag = randomUUID().slice(0, 8)
let authorId: string
let otherId: string
// O admin precisa existir de verdade: descartar passou a gravar uma mensagem na conversa,
// e `FeedbackMessage.createdById` tem FK para User.
const adminId = randomUUID()
const admin = { id: adminId, email: `admin-${randomUUID().slice(0, 8)}@test.local` }

async function newFeedback(title: string, data: { status?: "NEW" | "WONT_FIX" } = {}) {
  return prisma.feedback.create({
    data: {
      type: "SUGGESTION",
      title,
      message: `mensagem ${title}`,
      createdById: authorId,
      createdByEmail: `author-${tag}@test.local`,
      ...data,
    },
    select: { id: true },
  })
}

beforeAll(async () => {
  authorId = randomUUID()
  otherId = randomUUID()
  await prisma.user.createMany({
    data: [
      { id: authorId, email: `author-${tag}@test.local` },
      { id: otherId, email: `other-${tag}@test.local` },
      { id: adminId, email: admin.email },
    ],
  })
})

afterAll(async () => {
  await prisma.feedback.deleteMany({ where: { createdById: { in: [authorId, otherId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [authorId, otherId, adminId] } } })
  await prisma.$disconnect()
})

describe("Descartar exige justificativa", () => {
  it("recusa WONT_FIX sem justificativa e mantém o status anterior", async () => {
    const f = await newFeedback(`sem justificativa ${tag}`)

    await expect(updateFeedback(f.id, admin, { status: "WONT_FIX" })).rejects.toMatchObject({
      code: ERROR_CODES.feedbackResolutionRequired,
    })

    const after = await prisma.feedback.findUnique({ where: { id: f.id } })
    expect(after?.status).toBe("NEW")
  })

  it("recusa justificativa curta demais", async () => {
    const f = await newFeedback(`justificativa curta ${tag}`)

    await expect(
      updateFeedback(f.id, admin, { status: "WONT_FIX", resolutionNote: "não" }),
    ).rejects.toMatchObject({ code: ERROR_CODES.feedbackResolutionRequired })
  })

  it("descarta com justificativa e registra quem/quando triou", async () => {
    const f = await newFeedback(`descarte ok ${tag}`)

    await updateFeedback(f.id, admin, {
      status: "WONT_FIX",
      resolutionNote: "  Fora do escopo do TCC.  ",
    })

    const after = await prisma.feedback.findUnique({ where: { id: f.id } })
    expect(after?.status).toBe("WONT_FIX")
    expect(after?.resolutionNote).toBe("Fora do escopo do TCC.") // trim aplicado
    expect(after?.reviewedById).toBe(adminId)
    expect(after?.reviewedAt).toBeInstanceOf(Date)
  })

  it("publica a justificativa na conversa, como mensagem da administração", async () => {
    const f = await newFeedback(`descarte vira mensagem ${tag}`)

    await updateFeedback(f.id, admin, {
      status: "WONT_FIX",
      resolutionNote: "Comportamento é intencional nesta versão.",
    })

    const messages = await prisma.feedbackMessage.findMany({ where: { feedbackId: f.id } })
    expect(messages).toHaveLength(1)
    expect(messages[0]!.party).toBe("ADMIN")
    expect(messages[0]!.body).toBe("Comportamento é intencional nesta versão.")
    expect(messages[0]!.createdById).toBe(adminId)
  })

  it("só publica na TRANSIÇÃO: corrigir a justificativa depois não republica", async () => {
    const f = await newFeedback(`descarte sem repetir ${tag}`)
    await updateFeedback(f.id, admin, {
      status: "WONT_FIX",
      resolutionNote: "Primeira redação da justificativa.",
    })

    // Mexer na nota (ou reaplicar o mesmo status) não gera outra mensagem: a conversa é
    // imutável, e a mensagem já publicada continua sendo a que o autor leu.
    await updateFeedback(f.id, admin, { resolutionNote: "Segunda redação da justificativa." })
    await updateFeedback(f.id, admin, { status: "WONT_FIX" })

    expect(await prisma.feedbackMessage.count({ where: { feedbackId: f.id } })).toBe(1)
  })

  it("recusa apagar a justificativa enquanto o feedback está descartado", async () => {
    const f = await newFeedback(`limpar nota ${tag}`)
    await updateFeedback(f.id, admin, {
      status: "WONT_FIX",
      resolutionNote: "Comportamento é intencional.",
    })

    await expect(updateFeedback(f.id, admin, { resolutionNote: null })).rejects.toMatchObject({
      code: ERROR_CODES.feedbackResolutionRequired,
    })

    const after = await prisma.feedback.findUnique({ where: { id: f.id } })
    expect(after?.resolutionNote).toBe("Comportamento é intencional.")
  })

  it("sair de WONT_FIX libera apagar a justificativa", async () => {
    const f = await newFeedback(`reabrir ${tag}`)
    await updateFeedback(f.id, admin, {
      status: "WONT_FIX",
      resolutionNote: "Não faz sentido agora.",
    })

    await updateFeedback(f.id, admin, { status: "IN_REVIEW" })
    await updateFeedback(f.id, admin, { resolutionNote: null })

    const after = await prisma.feedback.findUnique({ where: { id: f.id } })
    expect(after?.status).toBe("IN_REVIEW")
    expect(after?.resolutionNote).toBeNull()
  })
})

describe("Resposta ao autor em qualquer status", () => {
  it("escreve a resposta sem mudar o status nem a trilha de triagem", async () => {
    const f = await newFeedback(`resposta isolada ${tag}`)

    await updateFeedback(f.id, admin, { resolutionNote: "Já está no roadmap." })

    const after = await prisma.feedback.findUnique({ where: { id: f.id } })
    expect(after?.status).toBe("NEW")
    expect(after?.resolutionNote).toBe("Já está no roadmap.")
    // Só a mudança de status escreve a trilha — editar a resposta depois não a reescreve.
    expect(after?.reviewedById).toBeNull()
    expect(after?.reviewedAt).toBeNull()
  })
})

describe("Correção pelo autor", () => {
  const edit = { type: "BUG" as const, title: "Título corrigido", message: "  texto corrigido  " }

  it("edita o próprio relato enquanto está NEW", async () => {
    const f = await newFeedback(`editável ${tag}`)

    const row = await updateMyFeedback(f.id, authorId, edit)
    expect(row.type).toBe("BUG")
    expect(row.title).toBe("Título corrigido")
    expect(row.message).toBe("texto corrigido") // trim aplicado
    expect(row.status).toBe("NEW")
    expect("adminNote" in row).toBe(false)
  })

  it("bloqueia a edição depois que o feedback entra em triagem", async () => {
    const f = await newFeedback(`em triagem ${tag}`)
    await updateFeedback(f.id, admin, { status: "IN_REVIEW" })

    await expect(updateMyFeedback(f.id, authorId, edit)).rejects.toMatchObject({
      code: ERROR_CODES.feedbackNotEditable,
    })

    const after = await prisma.feedback.findUnique({ where: { id: f.id } })
    expect(after?.title).toBe(`em triagem ${tag}`)
  })

  it("não deixa um usuário editar o relato de outro (responde como inexistente)", async () => {
    const f = await newFeedback(`alheio ${tag}`)

    await expect(updateMyFeedback(f.id, otherId, edit)).rejects.toMatchObject({
      code: ERROR_CODES.feedbackNotFound,
    })
  })
})

describe("Visão do autor", () => {
  it("lista só os próprios envios e nunca devolve a anotação interna", async () => {
    const mine = await newFeedback(`meu envio ${tag}`)
    await prisma.feedback.update({
      where: { id: mine.id },
      data: { adminNote: "segredo do admin", resolutionNote: "Vamos avaliar." },
    })
    await prisma.feedback.create({
      data: {
        type: "BUG",
        title: `envio alheio ${tag}`,
        message: "não é meu",
        createdById: otherId,
        createdByEmail: `other-${tag}@test.local`,
      },
    })

    const rows = await listMyFeedback(authorId)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(mine.id)
    expect(rows.every((r) => !("adminNote" in r))).toBe(true)

    const row = rows.find((r) => r.id === mine.id)
    expect(row?.resolutionNote).toBe("Vamos avaliar.")
    expect(JSON.stringify(rows)).not.toContain("segredo do admin")

    const alheios = await listMyFeedback(otherId)
    expect(alheios.some((r) => ids.includes(r.id))).toBe(false)
  })
})
