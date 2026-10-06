import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  addAttachment,
  addThreadMessage,
  countMyUnreadReplies,
  listMyFeedback,
  listThread,
  loadThreadAccess,
  markThreadRead,
  requestReopen,
  updateFeedback,
} from "@/lib/feedback"
import { FEEDBACK_ATTACHMENT_MAX_PER_TICKET } from "@/lib/feedback-media"
import { ERROR_CODES } from "@/lib/error-codes"

// Integração contra um Postgres real. Cobre as regras da CONVERSA do ticket:
//   1. quem participa (autor e admin global) e quem não participa (404 sem confirmar o id);
//   2. encerrar o ticket fecha a conversa para OS DOIS lados;
//   3. o autor reabre um ticket encerrado, e a justificativa vira a primeira mensagem;
//   4. o indicador de "mensagem nova" só acende para o outro lado, e a leitura o apaga;
//   5. o autor não vê a identidade de quem tria;
//   6. teto de imagens por ticket.
// Usa as funções reais de src/lib/feedback.

const tag = randomUUID().slice(0, 8)
let authorId: string
let strangerId: string
let adminId: string

const actor = (id: string, isSystemAdmin = false) => ({
  id,
  email: `${id}@test.local`,
  isSystemAdmin,
})

async function newFeedback(title: string, status: "NEW" | "RESOLVED" | "WONT_FIX" = "NEW") {
  return prisma.feedback.create({
    data: {
      type: "BUG",
      title,
      message: `mensagem ${title}`,
      status,
      // WONT_FIX exige justificativa na triagem; criado direto, o campo é só coerência.
      resolutionNote: status === "WONT_FIX" ? "Fora do escopo do TCC." : null,
      createdById: authorId,
      createdByEmail: `${authorId}@test.local`,
    },
    select: { id: true },
  })
}

beforeAll(async () => {
  authorId = randomUUID()
  strangerId = randomUUID()
  adminId = randomUUID()
  await prisma.user.createMany({
    data: [authorId, strangerId, adminId].map((id) => ({ id, email: `${id}@test.local` })),
  })
})

afterAll(async () => {
  const ids = [authorId, strangerId, adminId]
  // Mensagens e anexos saem por cascade junto com o ticket.
  await prisma.feedback.deleteMany({ where: { createdById: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

describe("Quem participa da conversa", () => {
  it("resolve o lado de cada um: autor e administração", async () => {
    const f = await newFeedback(`lados ${tag}`)

    expect((await loadThreadAccess(f.id, actor(authorId))).party).toBe("AUTHOR")
    expect((await loadThreadAccess(f.id, actor(adminId, true))).party).toBe("ADMIN")
  })

  it("responde como inexistente para quem não é autor nem admin", async () => {
    const f = await newFeedback(`estranho ${tag}`)

    await expect(loadThreadAccess(f.id, actor(strangerId))).rejects.toMatchObject({
      code: ERROR_CODES.feedbackNotFound,
    })
  })

  it("admin global no PRÓPRIO ticket conversa como autor", async () => {
    const f = await newFeedback(`admin autor ${tag}`)

    // Mesmo id do autor, mas com o papel de admin global ligado.
    expect((await loadThreadAccess(f.id, actor(authorId, true))).party).toBe("AUTHOR")
  })

  it("guarda as mensagens em ordem, com o lado de quem escreveu", async () => {
    const f = await newFeedback(`ordem ${tag}`)

    await addThreadMessage(f.id, actor(authorId), "AUTHOR", "  Acontece ao salvar.  ")
    await addThreadMessage(f.id, actor(adminId, true), "ADMIN", "Em qual navegador?")

    const access = await loadThreadAccess(f.id, actor(adminId, true))
    const thread = await listThread(f.id, access)

    expect(thread.messages.map((m) => m.party)).toEqual(["AUTHOR", "ADMIN"])
    expect(thread.messages[0]!.body).toBe("Acontece ao salvar.") // trim aplicado
    expect(thread.open).toBe(true)
  })
})

describe("Ticket encerrado fecha a conversa para os dois lados", () => {
  for (const status of ["RESOLVED", "WONT_FIX"] as const) {
    it(`recusa mensagem do autor e do admin em ${status}`, async () => {
      const f = await newFeedback(`fechado ${status} ${tag}`, status)

      await expect(
        addThreadMessage(f.id, actor(authorId), "AUTHOR", "ainda acontece"),
      ).rejects.toMatchObject({ code: ERROR_CODES.feedbackThreadClosed })

      await expect(
        addThreadMessage(f.id, actor(adminId, true), "ADMIN", "vou olhar"),
      ).rejects.toMatchObject({ code: ERROR_CODES.feedbackThreadClosed })

      expect(await prisma.feedbackMessage.count({ where: { feedbackId: f.id } })).toBe(0)
      expect((await loadThreadAccess(f.id, actor(authorId))).open).toBe(false)
    })
  }

  it("reabrir pela triagem (IN_REVIEW) volta a aceitar mensagens", async () => {
    const f = await newFeedback(`reaberto pelo admin ${tag}`, "RESOLVED")

    await updateFeedback(f.id, actor(adminId, true), { status: "IN_REVIEW" })
    await addThreadMessage(f.id, actor(adminId, true), "ADMIN", "reabri para conferir")

    expect(await prisma.feedbackMessage.count({ where: { feedbackId: f.id } })).toBe(1)
  })
})

describe("Reabertura pedida pelo autor", () => {
  it("vira REOPENED e a justificativa entra como primeira mensagem", async () => {
    const f = await newFeedback(`reabrir ${tag}`, "WONT_FIX")

    const updated = await requestReopen(
      f.id,
      actor(authorId),
      "  Continua acontecendo no Chrome.  ",
    )
    expect(updated.status).toBe("REOPENED")

    const messages = await prisma.feedbackMessage.findMany({ where: { feedbackId: f.id } })
    expect(messages).toHaveLength(1)
    expect(messages[0]!.party).toBe("AUTHOR")
    expect(messages[0]!.body).toBe("Continua acontecendo no Chrome.") // trim aplicado

    // Reaberto = conversa aberta outra vez, para os dois lados.
    expect((await loadThreadAccess(f.id, actor(adminId, true))).open).toBe(true)
    await addThreadMessage(f.id, actor(adminId, true), "ADMIN", "obrigado, vou reproduzir")
  })

  it("não reescreve a trilha de triagem: o pedido do autor não é uma decisão", async () => {
    const f = await newFeedback(`trilha ${tag}`)
    await updateFeedback(f.id, actor(adminId, true), { status: "RESOLVED" })
    const triaged = await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } })

    await requestReopen(f.id, actor(authorId), "Ainda não resolveu para mim.")

    const after = await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } })
    expect(after.reviewedById).toBe(adminId)
    expect(after.reviewedAt).toEqual(triaged.reviewedAt)
  })

  it("recusa reabrir um ticket que ainda está aberto", async () => {
    const f = await newFeedback(`aberto ${tag}`)

    await expect(
      requestReopen(f.id, actor(authorId), "quero reabrir mesmo assim"),
    ).rejects.toMatchObject({ code: ERROR_CODES.feedbackNotReopenable })
  })

  it("ticket de outro autor responde como inexistente", async () => {
    const f = await newFeedback(`alheio ${tag}`, "RESOLVED")

    await expect(
      requestReopen(f.id, actor(strangerId), "não é meu, mas quero reabrir"),
    ).rejects.toMatchObject({ code: ERROR_CODES.feedbackNotFound })
  })
})

describe("Indicador de mensagem nova", () => {
  it("acende só para o outro lado e apaga na leitura", async () => {
    const f = await newFeedback(`nao lida ${tag}`)

    // Mensagem do próprio autor não acende o aviso para ele.
    await addThreadMessage(f.id, actor(authorId), "AUTHOR", "não consigo salvar")
    let mine = (await listMyFeedback(authorId)).find((r) => r.id === f.id)!
    expect(mine.unread).toBe(false)
    expect(mine.messageCount).toBe(1)

    // A resposta da administração acende.
    await addThreadMessage(f.id, actor(adminId, true), "ADMIN", "consegue mandar um print?")
    mine = (await listMyFeedback(authorId)).find((r) => r.id === f.id)!
    expect(mine.unread).toBe(true)
    expect(await countMyUnreadReplies(authorId)).toBeGreaterThan(0)

    // Abrir a conversa apaga.
    await markThreadRead(f.id, "AUTHOR")
    mine = (await listMyFeedback(authorId)).find((r) => r.id === f.id)!
    expect(mine.unread).toBe(false)
  })

  it("marcar como lida não conta como alteração do ticket", async () => {
    const f = await newFeedback(`updatedAt ${tag}`)
    const before = await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } })

    await markThreadRead(f.id, "ADMIN")

    const after = await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } })
    expect(after.updatedAt).toEqual(before.updatedAt)
    expect(after.adminReadAt).not.toBeNull()
  })
})

describe("Recorte por lado na leitura", () => {
  it("o autor não vê quem, da administração, escreveu", async () => {
    const f = await newFeedback(`identidade ${tag}`)
    await addThreadMessage(f.id, actor(adminId, true), "ADMIN", "estamos analisando")

    const asAuthor = await listThread(f.id, await loadThreadAccess(f.id, actor(authorId)))
    expect(asAuthor.messages[0]!.createdByEmail).toBeNull()

    // Do lado da administração, o e-mail de quem escreveu continua visível.
    const asAdmin = await listThread(f.id, await loadThreadAccess(f.id, actor(adminId, true)))
    expect(asAdmin.messages[0]!.createdByEmail).toBe(`${adminId}@test.local`)
  })
})

describe("Teto de imagens por ticket", () => {
  it("recusa passar do limite, somando os dois lados", async () => {
    const f = await newFeedback(`anexos ${tag}`)
    const base = {
      feedbackId: f.id,
      messageId: null,
      actor: actor(authorId),
      party: "AUTHOR" as const,
      mimeType: "image/png",
      filename: "print.png",
      size: 1024,
    }

    for (let i = 0; i < FEEDBACK_ATTACHMENT_MAX_PER_TICKET; i++) {
      await addAttachment({ ...base, path: `${f.id}/${i}.png` })
    }

    await expect(addAttachment({ ...base, path: `${f.id}/extra.png` })).rejects.toMatchObject({
      code: ERROR_CODES.feedbackAttachmentLimit,
    })
    expect(await prisma.feedbackAttachment.count({ where: { feedbackId: f.id } })).toBe(
      FEEDBACK_ATTACHMENT_MAX_PER_TICKET,
    )
  })

  it("recusa anexar em ticket encerrado", async () => {
    const f = await newFeedback(`anexo fechado ${tag}`, "RESOLVED")

    await expect(
      addAttachment({
        feedbackId: f.id,
        messageId: null,
        actor: actor(adminId, true),
        party: "ADMIN",
        path: `${f.id}/tarde.png`,
        mimeType: "image/png",
        filename: "tarde.png",
        size: 1024,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.feedbackThreadClosed })
  })
})
