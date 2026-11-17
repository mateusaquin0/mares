// Feedback (sugestões e bugs): triagem pelo admin global, correção pelo autor, conversa do
// ticket e anexos. Banco e Storage simulados; o alvo são as regras de negócio — quem vê o quê,
// quando a conversa aceita escrita, descarte com justificativa, reabertura.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

const signMediaUrl = vi.fn<(path: string, bucket: string) => Promise<string>>(
  async (path) => `signed:${path}`,
)
vi.mock("@/lib/media", () => ({
  signMediaUrl: (path: string, bucket: string) => signMediaUrl(path, bucket),
  sniffMime: () => null,
}))

import { arg, m, prismaError, resetDb, root } from "./helpers/prisma-mock"
import {
  addAttachment,
  addThreadMessage,
  adminSelect,
  assertResolutionNote,
  countMyUnreadReplies,
  deleteAttachment,
  isThreadOpen,
  listFeedback,
  listMyFeedback,
  listThread,
  loadThreadAccess,
  markThreadRead,
  mineSelect,
  requestReopen,
  updateFeedback,
  updateMyFeedback,
} from "@/lib/feedback"
import { FEEDBACK_ATTACHMENT_MAX_PER_TICKET } from "@/lib/feedback-media"

const T = (iso: string) => new Date(`2026-03-${iso}:00.000Z`)
type Party = "ADMIN" | "AUTHOR"
const meta = (over: {
  last?: { party: Party; createdAt: Date } | null
  authorReadAt?: Date | null
  adminReadAt?: Date | null
}) => ({
  authorReadAt: over.authorReadAt ?? null,
  adminReadAt: over.adminReadAt ?? null,
  _count: { messages: over.last ? 3 : 0, attachments: 1 },
  messages: over.last ? [over.last] : [],
})

const author = { id: "u-autor", email: "ana@test.local", isSystemAdmin: false }
const admin = { id: "u-admin", email: "root@test.local", isSystemAdmin: true }
const stranger = { id: "u-outro", email: "x@test.local", isSystemAdmin: false }

beforeEach(() => {
  resetDb()
  signMediaUrl.mockClear()
})

describe("recorte de colunas por visão", () => {
  // Não basta esconder na tela: o recorte é no servidor.
  it("o autor nunca recebe a anotação interna nem quem triou", () => {
    expect("adminNote" in mineSelect).toBe(false)
    expect("reviewedById" in mineSelect).toBe(false)
    expect("createdByEmail" in mineSelect).toBe(false)
    expect(adminSelect.adminNote).toBe(true)
    expect(mineSelect.resolutionNote).toBe(true)
  })
})

describe("resumo da conversa — indicador de 'não lido'", () => {
  const row = (m_: ReturnType<typeof meta>) => ({ id: "f1", title: "t", ...m_ })

  it.each([
    ["sem mensagens", meta({}), false],
    [
      "a última mensagem é do próprio autor",
      meta({ last: { party: "AUTHOR", createdAt: T("10T10:00") } }),
      false,
    ],
    [
      "resposta do admin e o autor nunca abriu",
      meta({ last: { party: "ADMIN", createdAt: T("10T10:00") } }),
      true,
    ],
    [
      "resposta do admin chegou DEPOIS da última leitura",
      meta({ last: { party: "ADMIN", createdAt: T("10T10:00") }, authorReadAt: T("10T09:00") }),
      true,
    ],
    [
      "resposta do admin já lida",
      meta({ last: { party: "ADMIN", createdAt: T("10T10:00") }, authorReadAt: T("10T11:00") }),
      false,
    ],
    // A leitura do ADMIN não apaga o aviso do AUTOR: cada lado tem o seu marcador.
    [
      "só o admin leu a própria resposta",
      meta({ last: { party: "ADMIN", createdAt: T("10T10:00") }, adminReadAt: T("10T11:00") }),
      true,
    ],
  ])("visão do autor — %s → unread=%s", async (_label, m_, unread) => {
    m("feedback", "findMany").mockResolvedValue([row(m_)])
    const [item] = await listMyFeedback("u-autor")
    expect(item?.unread).toBe(unread)
  })

  it("visão do admin: mensagem do autor acende, do admin não; usa o marcador do admin", async () => {
    m("feedback", "findMany").mockResolvedValue([
      {
        id: "f1",
        createdBy: { name: "Ana" },
        ...meta({
          last: { party: "AUTHOR", createdAt: T("10T10:00") },
          authorReadAt: T("10T11:00"),
        }),
      },
      {
        id: "f2",
        createdBy: null,
        ...meta({ last: { party: "ADMIN", createdAt: T("10T10:00") } }),
      },
      {
        id: "f3",
        createdBy: { name: null },
        ...meta({
          last: { party: "AUTHOR", createdAt: T("10T10:00") },
          adminReadAt: T("10T12:00"),
        }),
      },
    ])
    const rows = await listFeedback()
    expect(rows.map((r) => r.unread)).toEqual([true, false, false])
    // O nome do autor é o VIVO; some quando a conta é removida.
    expect(rows.map((r) => r.createdByName)).toEqual(["Ana", null, null])
  })

  it("os campos crus viram contagens e somem do retorno", async () => {
    m("feedback", "findMany").mockResolvedValue([
      row(meta({ last: { party: "ADMIN", createdAt: T("10T10:00") } })),
    ])
    const [item] = (await listMyFeedback("u-autor")) as unknown as Record<string, unknown>[]
    expect(item).toMatchObject({
      messageCount: 3,
      attachmentCount: 1,
      lastMessageAt: T("10T10:00"),
    })
    for (const raw of ["authorReadAt", "adminReadAt", "_count", "messages"]) {
      expect(raw in item!).toBe(false)
    }
  })

  it("ticket sem conversa não tem data de última mensagem", async () => {
    m("feedback", "findMany").mockResolvedValue([row(meta({}))])
    expect((await listMyFeedback("u-autor"))[0]?.lastMessageAt).toBeNull()
  })

  it("as listas filtram por status (admin) e por autor (meus), mais recentes primeiro", async () => {
    m("feedback", "findMany").mockResolvedValue([])
    await listFeedback("IN_REVIEW")
    expect(arg(m("feedback", "findMany"))).toMatchObject({
      where: { status: "IN_REVIEW" },
      orderBy: { createdAt: "desc" },
    })
    await listFeedback()
    expect(arg(m("feedback", "findMany"), 1).where).toEqual({})
    await listMyFeedback("u-autor")
    expect(arg(m("feedback", "findMany"), 2).where).toEqual({ createdById: "u-autor" })
  })

  it("bolinha do menu: conta os tickets do autor com resposta não lida", async () => {
    m("feedback", "findMany").mockResolvedValue([
      meta({ last: { party: "ADMIN", createdAt: T("10T10:00") } }),
      meta({ last: { party: "ADMIN", createdAt: T("10T10:00") }, authorReadAt: T("11T10:00") }),
      meta({ last: { party: "AUTHOR", createdAt: T("10T10:00") } }),
      meta({ last: { party: "ADMIN", createdAt: T("12T10:00") }, authorReadAt: T("11T10:00") }),
    ])
    await expect(countMyUnreadReplies("u-autor")).resolves.toBe(2)
    expect(arg(m("feedback", "findMany")).where).toEqual({
      createdById: "u-autor",
      messages: { some: { party: "ADMIN" } },
    })
  })
})

describe("updateMyFeedback — o autor corrige o próprio relato", () => {
  const data = { type: "BUG" as const, title: "  Erro ao salvar ", message: " some o botão " }

  // Ticket de outro autor responde como inexistente: não confirma que o id existe.
  it.each([
    ["inexistente", null],
    ["de outro autor", { createdById: "u-outro", status: "NEW" }],
    ["de conta já removida", { createdById: null, status: "NEW" }],
  ])("ticket %s vira 404", async (_label, existing) => {
    m("feedback", "findUnique").mockResolvedValue(existing)
    await expect(updateMyFeedback("f1", "u-autor", data)).rejects.toMatchObject({
      name: "NotFoundError",
      code: "feedbackNotFound",
    })
    expect(m("feedback", "updateMany")).not.toHaveBeenCalled()
  })

  it.each(["IN_REVIEW", "RESOLVED", "WONT_FIX", "REOPENED"])(
    "depois de entrar em triagem (%s) o relato congela",
    async (status) => {
      m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status })
      await expect(updateMyFeedback("f1", "u-autor", data)).rejects.toMatchObject({
        name: "ForbiddenError",
        code: "feedbackNotEditable",
      })
      expect(m("feedback", "updateMany")).not.toHaveBeenCalled()
    },
  )

  it("NEW: grava aparado, com trava por autor e status no where", async () => {
    m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status: "NEW" })
    m("feedback", "updateMany").mockResolvedValue({ count: 1 })
    m("feedback", "findUniqueOrThrow").mockResolvedValue({
      id: "f1",
      title: "Erro ao salvar",
      ...meta({}),
    })
    const row = await updateMyFeedback("f1", "u-autor", data)
    expect(arg(m("feedback", "updateMany"))).toEqual({
      where: { id: "f1", createdById: "u-autor", status: "NEW" },
      data: { type: "BUG", title: "Erro ao salvar", message: "some o botão" },
    })
    expect(row).toMatchObject({ id: "f1", messageCount: 0, unread: false })
  })

  it("admin triou entre a checagem e a escrita: nada é sobrescrito e o autor é avisado", async () => {
    m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status: "NEW" })
    m("feedback", "updateMany").mockResolvedValue({ count: 0 })
    await expect(updateMyFeedback("f1", "u-autor", data)).rejects.toMatchObject({
      code: "feedbackNotEditable",
    })
    expect(m("feedback", "findUniqueOrThrow")).not.toHaveBeenCalled()
  })
})

describe("assertResolutionNote — descartar exige justificativa", () => {
  it.each([null, "", "   ", "curta", "  123456789  "])(
    "WONT_FIX com nota %j é recusado",
    (note) => {
      expect(() => assertResolutionNote("WONT_FIX", note)).toThrow(
        expect.objectContaining({ name: "ValidationError", code: "feedbackResolutionRequired" }),
      )
    },
  )

  it("WONT_FIX com 10+ caracteres úteis passa; os demais status não exigem nota", () => {
    expect(() => assertResolutionNote("WONT_FIX", "1234567890")).not.toThrow()
    for (const status of ["NEW", "IN_REVIEW", "RESOLVED", "REOPENED"] as const) {
      expect(() => assertResolutionNote(status, null)).not.toThrow()
    }
  })
})

describe("updateFeedback — triagem", () => {
  const NOTE = "Fora do escopo do projeto."
  const existing = (status: string, resolutionNote: string | null = null) =>
    m("feedback", "findUnique").mockResolvedValue({ status, resolutionNote })
  const data = () => arg<{ data: Record<string, unknown> }>(m("feedback", "update")).data

  it("ticket inexistente vira 404", async () => {
    m("feedback", "findUnique").mockResolvedValue(null)
    await expect(updateFeedback("f0", admin, { status: "RESOLVED" })).rejects.toMatchObject({
      code: "feedbackNotFound",
    })
  })

  it("mudar o status registra quem e quando triou", async () => {
    existing("NEW")
    await updateFeedback("f1", admin, { status: "IN_REVIEW" })
    expect(data()).toMatchObject({ status: "IN_REVIEW", reviewedById: "u-admin" })
    expect(data().reviewedAt).toBeInstanceOf(Date)
    expect(data().messages).toBeUndefined()
  })

  // Editar a resposta depois não reescreve quem/quando decidiu.
  it("editar só as notas (ou reenviar o mesmo status) não mexe na trilha de triagem", async () => {
    existing("IN_REVIEW")
    await updateFeedback("f1", admin, { adminNote: "  ver com a equipe ", status: "IN_REVIEW" })
    expect(data().adminNote).toBe("ver com a equipe")
    expect("reviewedById" in data()).toBe(false)
    expect("reviewedAt" in data()).toBe(false)
  })

  it("nota não enviada não altera; vazia ou null limpa", async () => {
    existing("IN_REVIEW")
    await updateFeedback("f1", admin, { status: "RESOLVED" })
    expect(data().adminNote).toBeUndefined()
    expect(data().resolutionNote).toBeUndefined()

    await updateFeedback("f1", admin, { adminNote: "   ", resolutionNote: null })
    const second = arg<{ data: Record<string, unknown> }>(m("feedback", "update"), 1).data
    expect(second.adminNote).toBeNull()
    expect(second.resolutionNote).toBeNull()
  })

  it("descartar sem justificativa (nem enviada, nem salva) é recusado", async () => {
    existing("IN_REVIEW")
    await expect(updateFeedback("f1", admin, { status: "WONT_FIX" })).rejects.toMatchObject({
      code: "feedbackResolutionRequired",
    })
    expect(m("feedback", "update")).not.toHaveBeenCalled()
  })

  // A checagem é sobre o ESTADO FINAL: vale a nota já salva.
  it("descartar aproveitando a justificativa já salva passa e a publica na conversa", async () => {
    existing("IN_REVIEW", NOTE)
    await updateFeedback("f1", admin, { status: "WONT_FIX" })
    expect(data().messages).toEqual({
      create: {
        body: NOTE,
        party: "ADMIN",
        createdById: "u-admin",
        createdByEmail: "root@test.local",
      },
    })
  })

  it("descartar com justificativa nova: a mensagem leva o texto aparado", async () => {
    existing("NEW")
    await updateFeedback("f1", admin, { status: "WONT_FIX", resolutionNote: `  ${NOTE}  ` })
    expect(data().resolutionNote).toBe(NOTE)
    expect((data().messages as { create: { body: string } }).create.body).toBe(NOTE)
  })

  it("apagar a justificativa de um ticket já descartado é recusado", async () => {
    existing("WONT_FIX", NOTE)
    await expect(updateFeedback("f1", admin, { resolutionNote: "" })).rejects.toMatchObject({
      code: "feedbackResolutionRequired",
    })
  })

  // Mensagem é imutável: reescrever a nota de um descarte não gera outra mensagem.
  it("editar a justificativa de um ticket JÁ descartado não publica de novo", async () => {
    existing("WONT_FIX", NOTE)
    await updateFeedback("f1", admin, { resolutionNote: "Justificativa revisada e ampliada." })
    expect(data().messages).toBeUndefined()
    expect("reviewedById" in data()).toBe(false)
  })

  it("sair do descarte dispensa a justificativa e não publica mensagem", async () => {
    existing("WONT_FIX", NOTE)
    await updateFeedback("f1", admin, { status: "IN_REVIEW", resolutionNote: null })
    expect(data()).toMatchObject({
      status: "IN_REVIEW",
      resolutionNote: null,
      reviewedById: "u-admin",
    })
    expect(data().messages).toBeUndefined()
  })
})

describe("conversa — acesso e lado", () => {
  it.each([
    ["NEW", true],
    ["IN_REVIEW", true],
    ["REOPENED", true],
    ["RESOLVED", false],
    ["WONT_FIX", false],
  ] as const)("ticket %s → conversa aberta=%s", (status, open) => {
    expect(isThreadOpen(status)).toBe(open)
  })

  const ticket = (over: Record<string, unknown> = {}) =>
    m("feedback", "findUnique").mockResolvedValue({
      id: "f1",
      status: "IN_REVIEW",
      createdById: "u-autor",
      ...over,
    })

  it("o autor conversa como AUTOR; o admin global, como ADMIN", async () => {
    ticket()
    await expect(loadThreadAccess("f1", author)).resolves.toEqual({
      id: "f1",
      status: "IN_REVIEW",
      party: "AUTHOR",
      open: true,
    })
    await expect(loadThreadAccess("f1", admin)).resolves.toMatchObject({ party: "ADMIN" })
  })

  // Do contrário ele responderia a si mesmo em nome da administração.
  it("admin global no PRÓPRIO ticket conversa como autor", async () => {
    ticket({ createdById: "u-admin" })
    await expect(loadThreadAccess("f1", admin)).resolves.toMatchObject({ party: "AUTHOR" })
  })

  it("quem não participa recebe 404 — nem confirma que o ticket existe", async () => {
    ticket()
    await expect(loadThreadAccess("f1", stranger)).rejects.toMatchObject({
      name: "NotFoundError",
      code: "feedbackNotFound",
    })
    m("feedback", "findUnique").mockResolvedValue(null)
    await expect(loadThreadAccess("f0", admin)).rejects.toMatchObject({ code: "feedbackNotFound" })
  })

  it("ticket órfão (autor removido) não vira de quem não tem id; o admin ainda acessa", async () => {
    ticket({ createdById: null, status: "RESOLVED" })
    await expect(loadThreadAccess("f1", stranger)).rejects.toMatchObject({
      code: "feedbackNotFound",
    })
    await expect(loadThreadAccess("f1", admin)).resolves.toMatchObject({
      party: "ADMIN",
      open: false,
    })
  })
})

describe("listThread", () => {
  const att = (id: string, messageId: string | null) => ({
    id,
    messageId,
    url: `f1/${id}.png`,
    mimeType: "image/png",
    filename: `${id}.png`,
    size: 10,
    uploadedById: "u-autor",
    uploadedByParty: "AUTHOR",
    createdAt: T("10T09:00"),
  })
  const messages = [
    {
      id: "m1",
      body: "como reproduzo?",
      party: "ADMIN",
      createdByEmail: "root@test.local",
      createdBy: { name: "Root" },
      createdAt: T("10T10:00"),
      attachments: [],
    },
    {
      id: "m2",
      body: "segue o print",
      party: "AUTHOR",
      createdByEmail: "ana@test.local",
      createdBy: { name: "Ana" },
      createdAt: T("10T11:00"),
      attachments: [att("a2", "m2")],
    },
    {
      id: "m3",
      body: "de conta removida",
      party: "AUTHOR",
      createdByEmail: "anonimizado@conta-excluida.invalid",
      createdBy: null,
      createdAt: T("10T12:00"),
      attachments: [],
    },
  ]
  const program = () => {
    m("feedbackMessage", "findMany").mockResolvedValue(messages)
    m("feedbackAttachment", "findMany").mockResolvedValue([att("a1", null)])
  }
  const access = (party: Party) => ({ id: "f1", status: "IN_REVIEW" as const, party, open: true })

  // O autor acompanha o ticket, não a identidade de quem tria.
  it("para o autor, as mensagens da administração vêm sem nome e sem e-mail", async () => {
    program()
    const thread = await listThread("f1", access("AUTHOR"))
    expect(thread.messages[0]).toMatchObject({
      party: "ADMIN",
      createdByName: null,
      createdByEmail: null,
    })
    expect(thread.messages[1]).toMatchObject({
      createdByName: "Ana",
      createdByEmail: "ana@test.local",
    })
    expect(thread).toMatchObject({ status: "IN_REVIEW", party: "AUTHOR", open: true })
  })

  it("para o admin, todos os autores vêm identificados; conta removida fica sem nome", async () => {
    program()
    const thread = await listThread("f1", access("ADMIN"))
    expect(thread.messages[0]).toMatchObject({
      createdByName: "Root",
      createdByEmail: "root@test.local",
    })
    expect(thread.messages[2]?.createdByName).toBeNull()
  })

  it("anexos saem com URL assinada do bucket de feedback; os do relato ficam separados", async () => {
    program()
    const thread = await listThread("f1", access("AUTHOR"))
    expect(thread.reportAttachments.map((a) => a.url)).toEqual(["signed:f1/a1.png"])
    expect(thread.messages[1]?.attachments[0]?.url).toBe("signed:f1/a2.png")
    expect(signMediaUrl).toHaveBeenCalledWith("f1/a1.png", "feedback-media")
    // "Do relato" = sem mensagem associada.
    expect(arg(m("feedbackAttachment", "findMany")).where).toEqual({
      feedbackId: "f1",
      messageId: null,
    })
  })

  it("falha ao assinar não derruba a conversa: a URL vem null", async () => {
    program()
    signMediaUrl.mockResolvedValueOnce(null as unknown as string)
    const thread = await listThread("f1", access("AUTHOR"))
    expect(thread.reportAttachments[0]?.url).toBeNull()
    expect(thread.reportAttachments[0]?.filename).toBe("a1.png")
  })
})

describe("addThreadMessage / markThreadRead", () => {
  it("publica com o texto aparado; a trava de 'ticket aberto' vai no where da escrita", async () => {
    m("feedback", "update").mockResolvedValue({ id: "f1" })
    const msg = await addThreadMessage("f1", author, "AUTHOR", "  segue o passo a passo ")
    const call = arg<{ where: unknown; data: { messages: { create: Record<string, unknown> } } }>(
      m("feedback", "update"),
    )
    expect(call.where).toEqual({ id: "f1", status: { in: ["NEW", "IN_REVIEW", "REOPENED"] } })
    expect(call.data.messages.create).toMatchObject({
      id: msg.id,
      body: "segue o passo a passo",
      party: "AUTHOR",
      createdById: "u-autor",
      createdByEmail: "ana@test.local",
    })
    expect(msg).toMatchObject({ body: "segue o passo a passo", party: "AUTHOR", attachments: [] })
    expect(msg.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  // Sem isto a própria mensagem voltaria marcada como novidade para quem a escreveu.
  it("quem escreve fica com a conversa lida — do próprio lado", async () => {
    m("feedback", "update").mockResolvedValue({ id: "f1" })
    await addThreadMessage("f1", admin, "ADMIN", "ok")
    const sql = (root("$executeRaw").mock.calls[0]![0] as string[]).join("?")
    expect(sql).toContain('"adminReadAt"')
    expect(root("$executeRaw").mock.calls[0]![1]).toBe("f1")
  })

  it("ticket encerrado no intervalo: a mensagem não é gravada e a conversa é dada como fechada", async () => {
    m("feedback", "update").mockRejectedValue(prismaError("P2025"))
    await expect(addThreadMessage("f1", author, "AUTHOR", "oi")).rejects.toMatchObject({
      name: "ForbiddenError",
      code: "feedbackThreadClosed",
    })
    expect(root("$executeRaw")).not.toHaveBeenCalled()
  })

  it("outra falha do banco não é confundida com conversa fechada", async () => {
    m("feedback", "update").mockRejectedValue(new Error("conexão caiu"))
    await expect(addThreadMessage("f1", author, "AUTHOR", "oi")).rejects.toThrow("conexão caiu")
  })

  it.each([
    ["ADMIN", '"adminReadAt"', '"authorReadAt"'],
    ["AUTHOR", '"authorReadAt"', '"adminReadAt"'],
  ] as const)(
    "marcar como lido por %s atualiza só o marcador desse lado",
    async (party, own, other) => {
      await markThreadRead("f1", party)
      const sql = (root("$executeRaw").mock.calls[0]![0] as string[]).join("?")
      expect(sql).toContain(own)
      expect(sql).not.toContain(other)
      // SQL cru de propósito: abrir a conversa não pode mexer no updatedAt do ticket.
      expect(m("feedback", "update")).not.toHaveBeenCalled()
    },
  )
})

describe("requestReopen — o autor pede para revisitar", () => {
  const REASON = "  O erro voltou a acontecer hoje. "

  it.each([
    ["inexistente", null],
    ["de outro autor", { createdById: "u-outro", status: "RESOLVED" }],
  ])("ticket %s vira 404", async (_label, existing) => {
    m("feedback", "findUnique").mockResolvedValue(existing)
    await expect(requestReopen("f1", author, REASON)).rejects.toMatchObject({
      code: "feedbackNotFound",
    })
  })

  // Nem o admin global reabre o ticket de outra pessoa por este caminho.
  it("só o autor pede reabertura — o admin global não", async () => {
    m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status: "RESOLVED" })
    await expect(requestReopen("f1", admin, REASON)).rejects.toMatchObject({
      code: "feedbackNotFound",
    })
  })

  it.each(["NEW", "IN_REVIEW", "REOPENED"])(
    "ticket ainda aberto (%s) não é reabrível",
    async (status) => {
      m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status })
      await expect(requestReopen("f1", author, REASON)).rejects.toMatchObject({
        name: "ForbiddenError",
        code: "feedbackNotReopenable",
      })
      expect(m("feedback", "update")).not.toHaveBeenCalled()
    },
  )

  it.each(["RESOLVED", "WONT_FIX"])(
    "ticket %s vira REOPENED, a justificativa entra como mensagem do autor e a trilha fica intacta",
    async (status) => {
      m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status })
      m("feedback", "update").mockResolvedValue({ id: "f1", status: "REOPENED" })
      await expect(requestReopen("f1", author, REASON)).resolves.toEqual({
        id: "f1",
        status: "REOPENED",
      })
      const call = arg<{ where: unknown; data: Record<string, unknown> }>(m("feedback", "update"))
      expect(call.where).toEqual({
        id: "f1",
        createdById: "u-autor",
        status: { in: ["RESOLVED", "WONT_FIX"] },
      })
      expect(call.data.status).toBe("REOPENED")
      expect(call.data.messages).toEqual({
        create: {
          body: "O erro voltou a acontecer hoje.",
          party: "AUTHOR",
          createdById: "u-autor",
          createdByEmail: "ana@test.local",
        },
      })
      // O pedido do autor não é uma decisão da administração.
      expect("reviewedById" in call.data).toBe(false)
      expect("reviewedAt" in call.data).toBe(false)
      expect((root("$executeRaw").mock.calls[0]![0] as string[]).join("?")).toContain(
        '"authorReadAt"',
      )
    },
  )

  it("admin mexeu no ticket no intervalo: nada é gravado", async () => {
    m("feedback", "findUnique").mockResolvedValue({ createdById: "u-autor", status: "RESOLVED" })
    m("feedback", "update").mockRejectedValue(prismaError("P2025"))
    await expect(requestReopen("f1", author, REASON)).rejects.toMatchObject({
      code: "feedbackNotReopenable",
    })
    expect(root("$executeRaw")).not.toHaveBeenCalled()
  })
})

describe("anexos do ticket", () => {
  const input = {
    feedbackId: "f1",
    messageId: null,
    actor: author,
    party: "AUTHOR" as const,
    path: "f1/x_tela.png",
    mimeType: "image/png",
    filename: "tela.png",
    size: 2048,
  }

  // O teto vale para os dois lados somados (relato + conversa).
  it("no limite de imagens por ticket, o próximo anexo é recusado", async () => {
    m("feedbackAttachment", "count").mockResolvedValue(FEEDBACK_ATTACHMENT_MAX_PER_TICKET)
    await expect(addAttachment(input)).rejects.toMatchObject({
      name: "ValidationError",
      code: "feedbackAttachmentLimit",
    })
    expect(m("feedback", "update")).not.toHaveBeenCalled()
    expect(arg(m("feedbackAttachment", "count")).where).toEqual({ feedbackId: "f1" })
  })

  it("abaixo do limite, registra a imagem com quem enviou e de que lado", async () => {
    m("feedbackAttachment", "count").mockResolvedValue(FEEDBACK_ATTACHMENT_MAX_PER_TICKET - 1)
    m("feedback", "update").mockResolvedValue({ id: "f1" })
    const { id } = await addAttachment({ ...input, messageId: "m1" })
    const call = arg<{ where: unknown; data: { attachments: { create: unknown } } }>(
      m("feedback", "update"),
    )
    expect(call.where).toEqual({ id: "f1", status: { in: ["NEW", "IN_REVIEW", "REOPENED"] } })
    expect(call.data.attachments.create).toEqual({
      id,
      messageId: "m1",
      url: "f1/x_tela.png",
      mimeType: "image/png",
      filename: "tela.png",
      size: 2048,
      uploadedById: "u-autor",
      uploadedByParty: "AUTHOR",
    })
  })

  it("ticket encerrado no intervalo: o anexo não é registrado", async () => {
    m("feedbackAttachment", "count").mockResolvedValue(0)
    m("feedback", "update").mockRejectedValue(prismaError("P2025"))
    await expect(addAttachment(input)).rejects.toMatchObject({ code: "feedbackThreadClosed" })
  })

  const stored = (over: { uploadedById?: string | null; status?: string } = {}) =>
    m("feedbackAttachment", "findFirst").mockResolvedValue({
      id: "a1",
      url: "f1/a1.png",
      uploadedById: "uploadedById" in over ? over.uploadedById : "u-autor",
      feedback: { status: over.status ?? "IN_REVIEW" },
    })

  it("imagem inexistente (ou de outro ticket) vira 404", async () => {
    m("feedbackAttachment", "findFirst").mockResolvedValue(null)
    await expect(deleteAttachment("f1", "a-x", author)).rejects.toMatchObject({
      code: "feedbackAttachmentNotFound",
    })
    // O id do anexo só vale DENTRO do ticket informado.
    expect(arg(m("feedbackAttachment", "findFirst")).where).toEqual({ id: "a-x", feedbackId: "f1" })
  })

  it("quem enviou remove a própria imagem com o ticket aberto e recebe o caminho para apagar do Storage", async () => {
    stored()
    await expect(deleteAttachment("f1", "a1", author)).resolves.toEqual({ path: "f1/a1.png" })
    expect(arg(m("feedbackAttachment", "delete"))).toEqual({ where: { id: "a1" } })
  })

  it("não se remove a imagem de outra pessoa", async () => {
    stored({ uploadedById: "u-admin" })
    await expect(deleteAttachment("f1", "a1", author)).rejects.toMatchObject({
      name: "ForbiddenError",
      code: "mediaDeleteNotUploader",
    })
    expect(m("feedbackAttachment", "delete")).not.toHaveBeenCalled()
  })

  it("com o ticket encerrado, nem quem enviou remove", async () => {
    stored({ status: "RESOLVED" })
    await expect(deleteAttachment("f1", "a1", author)).rejects.toMatchObject({
      code: "feedbackThreadClosed",
    })
    expect(m("feedbackAttachment", "delete")).not.toHaveBeenCalled()
  })

  // Moderação: o upload é aberto a qualquer autenticado.
  it("o admin global remove qualquer imagem, mesmo com o ticket encerrado", async () => {
    stored({ status: "WONT_FIX", uploadedById: null })
    await expect(deleteAttachment("f1", "a1", admin)).resolves.toEqual({ path: "f1/a1.png" })
  })
})
