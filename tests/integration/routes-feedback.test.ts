import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { FEEDBACK_BUCKET } from "@/lib/feedback-media"
import { ctx, json, login, req } from "./helpers/route"
import { fakeSupabase } from "./helpers/supabase-fake"
import { createFixtures } from "./helpers/org-fixtures"

import { GET as listAll, POST as sendFeedback } from "@/app/api/feedback/route"
import { PATCH as triage } from "@/app/api/feedback/[id]/route"
import { GET as listMine } from "@/app/api/feedback/mine/route"
import { PATCH as editMine } from "@/app/api/feedback/mine/[id]/route"
import { POST as reopen } from "@/app/api/feedback/mine/[id]/reopen/route"
import {
  GET as getThread,
  POST as postMessage,
  PATCH as markRead,
} from "@/app/api/feedback/[id]/thread/route"
import { POST as uploadAttachment } from "@/app/api/feedback/[id]/attachments/route"
import { DELETE as deleteAttachment } from "@/app/api/feedback/[id]/attachments/[attachmentId]/route"

// Tickets de feedback pelas rotas: envio, triagem do admin global, visão do autor, conversa e
// anexos. As regras de domínio têm teste próprio (feedback.test.ts, feedback-thread.test.ts);
// aqui o que se confere é a rota: quem entra, o que volta e o que fica gravado.

const fx = createFixtures("RotasFeedback")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let author: string
let stranger: string
let sysAdmin: string

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

type Status = "NEW" | "IN_REVIEW" | "RESOLVED" | "WONT_FIX" | "REOPENED"

/** Ticket gravado direto no banco (o envio pela rota tem teto de 10 por hora por usuário). */
async function ticket(userId = author, status: Status = "NEW") {
  const row = await prisma.feedback.create({
    data: {
      type: "BUG",
      title: fx.unique("Ticket"),
      message: "não consigo salvar",
      status,
      createdById: userId,
      createdByEmail: `${userId}@test.local`,
      resolutionNote: status === "WONT_FIX" ? "fora do escopo do projeto" : null,
    },
    select: { id: true },
  })
  fx.tracked.feedbacks.add(row.id)
  return row.id
}
const stored = (id: string) => prisma.feedback.findUniqueOrThrow({ where: { id } })
const messagesOf = (feedbackId: string) =>
  prisma.feedbackMessage.findMany({ where: { feedbackId }, orderBy: { createdAt: "asc" } })

const send = (body: unknown) => sendFeedback(req("/api/feedback", { body }))
const doTriage = (id: string, body: unknown) =>
  triage(req(`/api/feedback/${id}`, { method: "PATCH", body }), ctx({ id }))
const doEdit = (id: string, body: unknown) =>
  editMine(req(`/api/feedback/mine/${id}`, { method: "PATCH", body }), ctx({ id }))
const doReopen = (id: string, body: unknown) =>
  reopen(req(`/api/feedback/mine/${id}/reopen`, { body }), ctx({ id }))
const thread = (id: string) => getThread(req(`/api/feedback/${id}/thread`), ctx({ id }))
const say = (id: string, body: unknown) =>
  postMessage(req(`/api/feedback/${id}/thread`, { body }), ctx({ id }))
const read = (id: string) =>
  markRead(req(`/api/feedback/${id}/thread`, { method: "PATCH" }), ctx({ id }))

function upload(
  id: string,
  opts: {
    bytes?: Buffer
    type?: string
    name?: string
    messageId?: string
    origin?: string
    noFile?: boolean
  } = {},
) {
  const form = new FormData()
  if (!opts.noFile) {
    form.set(
      "file",
      new File([new Uint8Array(opts.bytes ?? PNG)], opts.name ?? "print da tela.png", {
        type: opts.type ?? "image/png",
      }),
    )
  }
  if (opts.messageId) form.set("messageId", opts.messageId)
  return uploadAttachment(
    req(`/api/feedback/${id}/attachments`, {
      form,
      headers: opts.origin ? { origin: opts.origin } : undefined,
    }),
    ctx({ id }),
  )
}
const removeAttachment = (id: string, attachmentId: string) =>
  deleteAttachment(
    req(`/api/feedback/${id}/attachments/${attachmentId}`, { method: "DELETE" }),
    ctx({ id, attachmentId }),
  )

beforeAll(async () => {
  orgA = await fx.org("Org A")
  author = await fx.user({ name: "Autora", memberships: [[orgA, "RESEARCHER"]] })
  stranger = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  sysAdmin = await fx.user({ name: "Admin Global", isSystemAdmin: true })
})

beforeEach(() => fakeSupabase.reset())

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("POST /api/feedback", () => {
  const valid = () => ({ type: "BUG", title: `  ${fx.unique("Título")} `, message: "  quebrou  " })

  it("401 sem sessão", async () => {
    login(null)
    expect((await send(valid())).status).toBe(401)
  })

  it("qualquer autenticado envia; o ticket nasce NEW com o grupo ativo de contexto", async () => {
    await fx.as(author)
    const body = { ...valid(), pageUrl: " /app/animals " }
    const res = await send(body)
    expect(res.status).toBe(201)
    const { id } = await json<{ id: string }>(res)
    fx.tracked.feedbacks.add(id)
    expect(await stored(id)).toMatchObject({
      type: "BUG",
      title: body.title.trim(),
      message: "quebrou",
      pageUrl: "/app/animals",
      status: "NEW",
      createdById: author,
      createdByEmail: `${author}@test.local`,
      orgId: orgA,
      adminNote: null,
      resolutionNote: null,
    })
  })

  it("o admin global também envia (sem grupo de contexto)", async () => {
    await fx.as(sysAdmin)
    const res = await send({ ...valid(), type: "SUGGESTION" })
    expect(res.status).toBe(201)
    const { id } = await json<{ id: string }>(res)
    fx.tracked.feedbacks.add(id)
    expect(await stored(id)).toMatchObject({ type: "SUGGESTION", orgId: null, pageUrl: null })
  })

  it("422 com tipo inválido, título vazio ou mensagem longa demais", async () => {
    await fx.as(stranger)
    for (const body of [
      { ...valid(), type: "ELOGIO" },
      { ...valid(), title: "   " },
      { ...valid(), message: "x".repeat(501) },
      null,
    ]) {
      expect((await send(body)).status).toBe(422)
    }
    expect(await prisma.feedback.count({ where: { createdById: stranger } })).toBe(0)
  })

  it("429 depois de 10 envios na mesma hora", async () => {
    const spammer = await fx.user()
    await fx.as(spammer)
    for (let i = 0; i < 10; i++) expect((await send(valid())).status).toBe(201)
    const blocked = await send(valid())
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await prisma.feedback.count({ where: { createdById: spammer } })).toBe(10)
  })
})

describe("GET /api/feedback (admin global)", () => {
  const list = (query = "") => listAll(req(`/api/feedback${query}`))

  it("401 sem sessão; 403 para quem não é admin global, inclusive o autor", async () => {
    login(null)
    expect((await list()).status).toBe(401)
    for (const who of [author, stranger]) {
      await fx.as(who)
      expect((await list()).status).toBe(403)
    }
  })

  it("lista tudo, com a anotação interna, o nome do autor e o aviso de mensagem nova", async () => {
    const id = await ticket()
    await prisma.feedback.update({ where: { id }, data: { adminNote: "nota interna" } })
    await fx.as(author)
    expect((await say(id, { body: "segue mais um detalhe" })).status).toBe(201)

    await fx.as(sysAdmin)
    const res = await list()
    expect(res.status).toBe(200)
    const rows = await json<Record<string, unknown>[]>(res)
    expect(rows.find((r) => r.id === id)).toMatchObject({
      status: "NEW",
      adminNote: "nota interna",
      createdByEmail: `${author}@test.local`,
      createdByName: "Autora",
      messageCount: 1,
      attachmentCount: 0,
      unread: true,
    })
  })

  it("filtra por status; valor fora do enum devolve a lista completa", async () => {
    const fresh = await ticket()
    const resolved = await ticket(author, "RESOLVED")
    await fx.as(sysAdmin)

    const onlyResolved = (await json<{ id: string }[]>(await list("?status=RESOLVED"))).map(
      (r) => r.id,
    )
    expect(onlyResolved).toContain(resolved)
    expect(onlyResolved).not.toContain(fresh)

    const all = (await json<{ id: string }[]>(await list("?status=QUALQUER"))).map((r) => r.id)
    expect(all).toEqual(expect.arrayContaining([fresh, resolved]))
  })
})

describe("GET /api/feedback/mine", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await listMine()).status).toBe(401)
  })

  it("devolve só os próprios tickets, sem a anotação interna nem quem revisou", async () => {
    const owner = await fx.user()
    const mine = await ticket(owner)
    const others = await ticket(author)
    await prisma.feedback.update({
      where: { id: mine },
      data: {
        adminNote: "nota interna",
        status: "RESOLVED",
        resolutionNote: "corrigido na versão nova",
        reviewedById: sysAdmin,
        reviewedAt: new Date(),
      },
    })

    await fx.as(owner)
    const res = await listMine()
    expect(res.status).toBe(200)
    const rows = await json<Record<string, unknown>[]>(res)
    expect(rows.map((r) => r.id)).toEqual([mine])
    expect(rows.map((r) => r.id)).not.toContain(others)
    expect(rows[0]).toMatchObject({
      status: "RESOLVED",
      resolutionNote: "corrigido na versão nova",
      unread: false,
    })
    expect(rows[0]).not.toHaveProperty("adminNote")
    expect(rows[0]).not.toHaveProperty("reviewedById")
    expect(rows[0]).not.toHaveProperty("createdByEmail")
  })
})

describe("PATCH /api/feedback/mine/[id]", () => {
  const edit = { type: "SUGGESTION", title: " Título corrigido ", message: " texto corrigido " }

  it("401 sem sessão", async () => {
    const id = await ticket()
    login(null)
    expect((await doEdit(id, edit)).status).toBe(401)
  })

  it("o autor corrige o relato enquanto está NEW", async () => {
    const id = await ticket()
    await fx.as(author)
    const res = await doEdit(id, edit)
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ id, type: "SUGGESTION", title: "Título corrigido" })
    expect(await stored(id)).toMatchObject({
      type: "SUGGESTION",
      title: "Título corrigido",
      message: "texto corrigido",
      status: "NEW",
    })
  })

  it("403 depois que o ticket entrou em triagem", async () => {
    const id = await ticket(author, "IN_REVIEW")
    const before = await stored(id)
    await fx.as(author)
    const res = await doEdit(id, edit)
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackNotEditable)
    expect(await stored(id)).toMatchObject({ title: before.title, message: before.message })
  })

  it("ticket de outra pessoa responde 404, inclusive para o admin global", async () => {
    const id = await ticket()
    const before = await stored(id)
    for (const who of [stranger, sysAdmin]) {
      await fx.as(who)
      const res = await doEdit(id, edit)
      expect(res.status).toBe(404)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackNotFound)
    }
    expect((await stored(id)).title).toBe(before.title)
  })

  it("422 com corpo inválido; 404 para ticket inexistente", async () => {
    const id = await ticket()
    await fx.as(author)
    expect((await doEdit(id, { ...edit, title: "" })).status).toBe(422)
    expect((await doEdit(randomUUID(), edit)).status).toBe(404)
  })
})

describe("PATCH /api/feedback/[id] (triagem)", () => {
  it("401 sem sessão; 403 para quem não é admin global, inclusive o autor", async () => {
    const id = await ticket()
    login(null)
    expect((await doTriage(id, { status: "RESOLVED" })).status).toBe(401)
    for (const who of [author, stranger]) {
      await fx.as(who)
      expect((await doTriage(id, { status: "RESOLVED" })).status).toBe(403)
    }
    expect(await stored(id)).toMatchObject({ status: "NEW", reviewedById: null })
  })

  it("muda o status com anotação interna e registra quem triou", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    const res = await doTriage(id, { status: "IN_REVIEW", adminNote: "  reproduzido  " })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ id, status: "IN_REVIEW" })
    const row = await stored(id)
    expect(row).toMatchObject({
      status: "IN_REVIEW",
      adminNote: "reproduzido",
      reviewedById: sysAdmin,
    })
    expect(row.reviewedAt).not.toBeNull()
    expect(await messagesOf(id)).toEqual([])
  })

  it("resolver com resposta ao autor não publica mensagem na conversa", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    const res = await doTriage(id, { status: "RESOLVED", resolutionNote: "corrigido hoje" })
    expect(res.status).toBe(200)
    expect(await stored(id)).toMatchObject({ status: "RESOLVED", resolutionNote: "corrigido hoje" })
    expect(await messagesOf(id)).toEqual([])
  })

  it("422: descartar exige justificativa (ausente ou curta demais)", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    const none = await doTriage(id, { status: "WONT_FIX" })
    expect(none.status).toBe(422)
    expect((await json<{ code: string }>(none)).code).toBe(ERROR_CODES.feedbackResolutionRequired)
    expect((await doTriage(id, { status: "WONT_FIX", resolutionNote: "não" })).status).toBe(422)
    expect(await stored(id)).toMatchObject({ status: "NEW", resolutionNote: null })
  })

  it("descartar com justificativa publica-a na conversa como mensagem da administração", async () => {
    const id = await ticket()
    const admin = await fx.as(sysAdmin)
    const note = "duplicado do ticket anterior"
    expect((await doTriage(id, { status: "WONT_FIX", resolutionNote: note })).status).toBe(200)
    expect(await stored(id)).toMatchObject({ status: "WONT_FIX", resolutionNote: note })
    expect(await messagesOf(id)).toEqual([
      expect.objectContaining({
        body: note,
        party: "ADMIN",
        createdById: sysAdmin,
        createdByEmail: admin.email,
      }),
    ])
  })

  it("422 com corpo vazio ou status que a triagem não grava; 404 inexistente", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    expect((await doTriage(id, {})).status).toBe(422)
    expect((await doTriage(id, { status: "REOPENED" })).status).toBe(422)
    expect(await stored(id)).toMatchObject({ status: "NEW" })
    const missing = await doTriage(randomUUID(), { status: "RESOLVED" })
    expect(missing.status).toBe(404)
    expect((await json<{ code: string }>(missing)).code).toBe(ERROR_CODES.feedbackNotFound)
  })

  // BUG: ao descartar de novo um ticket reaberto sem enviar justificativa nova, a triagem
  // reaproveita a `resolutionNote` salva e a publica outra vez na conversa. A justificativa
  // antiga não deveria reaparecer como se fosse a resposta à reabertura.
  it.fails("descartar de novo não republica a justificativa antiga", async () => {
    const id = await ticket()
    const note = "fora do escopo do projeto"
    await fx.as(sysAdmin)
    await doTriage(id, { status: "WONT_FIX", resolutionNote: note })
    await fx.as(author)
    expect((await doReopen(id, { reason: "o problema continua acontecendo" })).status).toBe(200)

    await fx.as(sysAdmin)
    await doTriage(id, { status: "WONT_FIX" })
    const repeated = (await messagesOf(id)).filter((m) => m.body === note)
    expect(repeated).toHaveLength(1)
  })
})

describe("POST /api/feedback/mine/[id]/reopen", () => {
  const reason = "  continua acontecendo no Firefox  "

  it("401 sem sessão", async () => {
    const id = await ticket(author, "RESOLVED")
    login(null)
    expect((await doReopen(id, { reason })).status).toBe(401)
  })

  it("o autor reabre um ticket encerrado e a justificativa vira mensagem", async () => {
    const id = await ticket(author, "RESOLVED")
    await prisma.feedback.update({
      where: { id },
      data: { reviewedById: sysAdmin, reviewedAt: new Date() },
    })
    await fx.as(author)
    const res = await doReopen(id, { reason })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ id, status: "REOPENED" })
    // A trilha da última decisão da administração não é tocada.
    expect(await stored(id)).toMatchObject({ status: "REOPENED", reviewedById: sysAdmin })
    expect(await messagesOf(id)).toEqual([
      expect.objectContaining({
        body: "continua acontecendo no Firefox",
        party: "AUTHOR",
        createdById: author,
      }),
    ])
  })

  it("403 para ticket ainda aberto", async () => {
    const id = await ticket(author, "IN_REVIEW")
    await fx.as(author)
    const res = await doReopen(id, { reason })
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackNotReopenable)
    expect(await stored(id)).toMatchObject({ status: "IN_REVIEW" })
    expect(await messagesOf(id)).toEqual([])
  })

  it("ticket de outra pessoa responde 404, inclusive para o admin global", async () => {
    const id = await ticket(author, "WONT_FIX")
    for (const who of [stranger, sysAdmin]) {
      await fx.as(who)
      expect((await doReopen(id, { reason })).status).toBe(404)
    }
    expect(await stored(id)).toMatchObject({ status: "WONT_FIX" })
  })

  it("422 com justificativa curta", async () => {
    const id = await ticket(author, "RESOLVED")
    await fx.as(author)
    expect((await doReopen(id, { reason: "discordo" })).status).toBe(422)
    expect((await doReopen(id, null)).status).toBe(422)
    expect(await stored(id)).toMatchObject({ status: "RESOLVED" })
  })

  it("429 depois de 10 tentativas na mesma hora", async () => {
    const owner = await fx.user()
    const id = await ticket(owner, "RESOLVED")
    await fx.as(owner)
    for (let i = 0; i < 10; i++) {
      expect((await doReopen(id, { reason: "curta" })).status).toBe(422)
    }
    expect((await doReopen(id, { reason })).status).toBe(429)
    expect(await stored(id)).toMatchObject({ status: "RESOLVED" })
  })
})

describe("/api/feedback/[id]/thread", () => {
  it("401 sem sessão (GET, POST e PATCH)", async () => {
    const id = await ticket()
    login(null)
    expect((await thread(id)).status).toBe(401)
    expect((await say(id, { body: "oi" })).status).toBe(401)
    expect((await read(id)).status).toBe(401)
  })

  it("quem não participa do ticket recebe 404 nas três operações", async () => {
    const id = await ticket()
    await fx.as(stranger)
    for (const res of [await thread(id), await say(id, { body: "intruso" }), await read(id)]) {
      expect(res.status).toBe(404)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackNotFound)
    }
    expect(await messagesOf(id)).toEqual([])
    await fx.as(sysAdmin)
    expect((await thread(randomUUID())).status).toBe(404)
  })

  it("autor e administração conversam; cada mensagem fica com o lado de quem escreveu", async () => {
    const id = await ticket()
    const authorUser = await fx.as(author)
    const first = await say(id, { body: "  acontece ao salvar a amostra  " })
    expect(first.status).toBe(201)
    expect(await json(first)).toMatchObject({
      body: "acontece ao salvar a amostra",
      party: "AUTHOR",
      createdByEmail: authorUser.email,
    })

    const admin = await fx.as(sysAdmin)
    const reply = await say(id, { body: "consegue mandar um print?" })
    expect(reply.status).toBe(201)
    expect(await json(reply)).toMatchObject({ party: "ADMIN" })

    expect(await messagesOf(id)).toEqual([
      expect.objectContaining({ party: "AUTHOR", createdById: author }),
      expect.objectContaining({
        party: "ADMIN",
        createdById: sysAdmin,
        createdByEmail: admin.email,
        body: "consegue mandar um print?",
      }),
    ])
  })

  it("o autor lê a conversa sem a identidade de quem responde; o admin vê tudo", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    await say(id, { body: "estamos analisando" })

    await fx.as(author)
    const asAuthor = await thread(id)
    expect(asAuthor.status).toBe(200)
    expect(await json(asAuthor)).toMatchObject({
      status: "NEW",
      party: "AUTHOR",
      open: true,
      reportAttachments: [],
      messages: [
        { body: "estamos analisando", party: "ADMIN", createdByName: null, createdByEmail: null },
      ],
    })

    await fx.as(sysAdmin)
    expect(await json(await thread(id))).toMatchObject({
      party: "ADMIN",
      messages: [{ createdByName: "Admin Global", createdByEmail: `${sysAdmin}@test.local` }],
    })
  })

  it("a resposta da administração acende o aviso do autor; marcar como lida apaga", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    await say(id, { body: "pode detalhar?" })

    await fx.as(author)
    const before = (await json<{ id: string; unread: boolean }[]>(await listMine())).find(
      (r) => r.id === id,
    )!
    expect(before.unread).toBe(true)

    const updatedAt = (await stored(id)).updatedAt
    const res = await read(id)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true })
    const row = await stored(id)
    expect(row.authorReadAt).not.toBeNull()
    // Abrir a conversa não é alteração do ticket.
    expect(row.updatedAt).toEqual(updatedAt)

    const after = (await json<{ id: string; unread: boolean }[]>(await listMine())).find(
      (r) => r.id === id,
    )!
    expect(after.unread).toBe(false)
  })

  it("ticket encerrado não aceita mensagem de nenhum dos lados (403)", async () => {
    const id = await ticket(author, "RESOLVED")
    for (const who of [author, sysAdmin]) {
      await fx.as(who)
      const res = await say(id, { body: "só mais uma coisa" })
      expect(res.status).toBe(403)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackThreadClosed)
    }
    expect(await messagesOf(id)).toEqual([])
    // Ler continua permitido.
    expect(await json(await thread(id))).toMatchObject({ open: false, status: "RESOLVED" })
  })

  it("422 com mensagem vazia ou longa demais", async () => {
    const id = await ticket()
    await fx.as(author)
    expect((await say(id, { body: "   " })).status).toBe(422)
    expect((await say(id, { body: "x".repeat(2001) })).status).toBe(422)
    expect(await messagesOf(id)).toEqual([])
  })
})

describe("POST /api/feedback/[id]/attachments", () => {
  const rows = (feedbackId: string) => prisma.feedbackAttachment.findMany({ where: { feedbackId } })

  it("403 quando a origem não é a própria aplicação; 401 sem sessão", async () => {
    const id = await ticket()
    await fx.as(author)
    expect((await upload(id, { origin: "https://outro-site.test" })).status).toBe(403)
    login(null)
    expect((await upload(id)).status).toBe(401)
    expect(await rows(id)).toEqual([])
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })

  it("o autor anexa uma imagem ao relato: arquivo no bucket e linha no banco", async () => {
    const id = await ticket()
    await fx.as(author)
    const res = await upload(id)
    expect(res.status).toBe(201)
    const { id: attachmentId } = await json<{ id: string }>(res)

    const files = fakeSupabase.files(FEEDBACK_BUCKET)
    expect(files).toHaveLength(1)
    expect(files[0]!.startsWith(`${id}/`)).toBe(true)
    expect(files[0]).toMatch(/_print_da_tela\.png$/)
    expect(
      await prisma.feedbackAttachment.findUniqueOrThrow({ where: { id: attachmentId } }),
    ).toMatchObject({
      feedbackId: id,
      messageId: null,
      url: files[0],
      mimeType: "image/png",
      filename: "print da tela.png",
      size: PNG.length,
      uploadedById: author,
      uploadedByParty: "AUTHOR",
    })

    // A conversa devolve o anexo com URL assinada, nunca o caminho cru.
    const body = await json<{ reportAttachments: { id: string; url: string }[] }>(await thread(id))
    expect(body.reportAttachments).toEqual([
      expect.objectContaining({
        id: attachmentId,
        url: expect.stringContaining(`${FEEDBACK_BUCKET}/${files[0]}`),
      }),
    ])
  })

  it("o tipo gravado é o detectado no conteúdo, não o declarado", async () => {
    const id = await ticket()
    await fx.as(author)
    const res = await upload(id, { bytes: JPEG, type: "image/png", name: "foto.png" })
    expect(res.status).toBe(201)
    expect((await rows(id))[0]).toMatchObject({ mimeType: "image/jpeg" })
    const stored = fakeSupabase.buckets.get(FEEDBACK_BUCKET)!
    expect([...stored.values()][0]!.contentType).toBe("image/jpeg")
  })

  it("a administração anexa a uma mensagem da conversa", async () => {
    const id = await ticket()
    await fx.as(sysAdmin)
    const message = await json<{ id: string }>(await say(id, { body: "veja a tela esperada" }))
    const res = await upload(id, { messageId: message.id })
    expect(res.status).toBe(201)
    expect((await rows(id))[0]).toMatchObject({
      messageId: message.id,
      uploadedById: sysAdmin,
      uploadedByParty: "ADMIN",
    })
    const body = await json<{
      messages: { attachments: unknown[] }[]
      reportAttachments: unknown[]
    }>(await thread(id))
    expect(body.reportAttachments).toEqual([])
    expect(body.messages[0]!.attachments).toHaveLength(1)
  })

  it("422 sem arquivo, com tipo não aceito, conteúdo que não é imagem ou acima de 5 MB", async () => {
    const id = await ticket()
    await fx.as(author)
    const cases = [
      await upload(id, { noFile: true }),
      await upload(id, { type: "application/pdf", bytes: Buffer.from("%PDF-1.7") }),
      await upload(id, { bytes: Buffer.from("<script>alert(1)</script>") }),
    ]
    for (const res of cases) {
      expect(res.status).toBe(422)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.mediaInvalidType)
    }
    const big = await upload(id, { bytes: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]) })
    expect(big.status).toBe(422)
    expect((await json<{ code: string }>(big)).code).toBe(ERROR_CODES.mediaTooLarge)

    expect(await rows(id)).toEqual([])
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })

  it("422 quando a mensagem informada é de outro ticket", async () => {
    const id = await ticket()
    const other = await ticket()
    await fx.as(author)
    const foreign = await json<{ id: string }>(await say(other, { body: "mensagem do outro" }))
    const res = await upload(id, { messageId: foreign.id })
    expect(res.status).toBe(422)
    expect(await rows(id)).toEqual([])
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })

  it("quem não participa recebe 404; ticket encerrado recusa (403) sem deixar arquivo", async () => {
    const id = await ticket()
    await fx.as(stranger)
    expect((await upload(id)).status).toBe(404)

    const closed = await ticket(author, "RESOLVED")
    await fx.as(author)
    const res = await upload(closed)
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackThreadClosed)
    expect(await rows(closed)).toEqual([])
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })

  it("falha do Storage responde 422 e não grava a linha", async () => {
    const id = await ticket()
    fakeSupabase.failNext.upload = "bucket indisponível"
    await fx.as(author)
    const res = await upload(id)
    expect(res.status).toBe(422)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.mediaUploadFailed)
    expect(await rows(id)).toEqual([])
  })

  it("422 ao passar de 10 imagens no ticket — o arquivo excedente é removido", async () => {
    const id = await ticket()
    await prisma.feedbackAttachment.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        feedbackId: id,
        url: `${id}/existente-${i}.png`,
        mimeType: "image/png",
        filename: `existente-${i}.png`,
        size: 10,
        uploadedById: author,
        uploadedByParty: "AUTHOR" as const,
      })),
    })
    await fx.as(author)
    const res = await upload(id)
    expect(res.status).toBe(422)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.feedbackAttachmentLimit)
    expect(await rows(id)).toHaveLength(10)
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })
})

describe("DELETE /api/feedback/[id]/attachments/[attachmentId]", () => {
  /** Anexo enviado pela rota em nome de `userId`. */
  async function attached(feedbackId: string, userId: string) {
    await fx.as(userId)
    const res = await upload(feedbackId)
    expect(res.status).toBe(201)
    return (await json<{ id: string }>(res)).id
  }
  const exists = async (attachmentId: string) =>
    (await prisma.feedbackAttachment.count({ where: { id: attachmentId } })) === 1

  it("401 sem sessão; 404 para quem não participa do ticket", async () => {
    const id = await ticket()
    const attachmentId = await attached(id, author)
    login(null)
    expect((await removeAttachment(id, attachmentId)).status).toBe(401)
    await fx.as(stranger)
    expect((await removeAttachment(id, attachmentId)).status).toBe(404)
    expect(await exists(attachmentId)).toBe(true)
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toHaveLength(1)
  })

  it("quem enviou exclui a própria imagem: linha e arquivo somem", async () => {
    const id = await ticket()
    const attachmentId = await attached(id, author)
    const res = await removeAttachment(id, attachmentId)
    expect(res.status).toBe(204)
    expect(await exists(attachmentId)).toBe(false)
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })

  it("o autor não exclui imagem enviada pela administração (403)", async () => {
    const id = await ticket()
    const attachmentId = await attached(id, sysAdmin)
    await fx.as(author)
    const res = await removeAttachment(id, attachmentId)
    expect(res.status).toBe(403)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.mediaDeleteNotUploader)
    expect(await exists(attachmentId)).toBe(true)
  })

  it("ticket encerrado: quem enviou não exclui mais; o admin global ainda modera", async () => {
    const id = await ticket()
    const attachmentId = await attached(id, author)
    await prisma.feedback.update({ where: { id }, data: { status: "RESOLVED" } })

    const denied = await removeAttachment(id, attachmentId)
    expect(denied.status).toBe(403)
    expect((await json<{ code: string }>(denied)).code).toBe(ERROR_CODES.feedbackThreadClosed)
    expect(await exists(attachmentId)).toBe(true)

    await fx.as(sysAdmin)
    expect((await removeAttachment(id, attachmentId)).status).toBe(204)
    expect(await exists(attachmentId)).toBe(false)
    expect(fakeSupabase.files(FEEDBACK_BUCKET)).toEqual([])
  })

  it("404 para imagem inexistente ou de outro ticket", async () => {
    const id = await ticket()
    const other = await ticket()
    const attachmentId = await attached(other, author)
    const wrongTicket = await removeAttachment(id, attachmentId)
    expect(wrongTicket.status).toBe(404)
    expect((await json<{ code: string }>(wrongTicket)).code).toBe(
      ERROR_CODES.feedbackAttachmentNotFound,
    )
    expect((await removeAttachment(id, randomUUID())).status).toBe(404)
    expect(await exists(attachmentId)).toBe(true)
  })
})
