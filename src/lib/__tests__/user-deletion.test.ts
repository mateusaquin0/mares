// Exclusão de conta (LGPD, art. 18, VI): os dados pessoais somem, os registros científicos
// ficam. Sobram os "snapshots" de e-mail/nome gravados em texto — é o que precisa ser
// anonimizado junto, na MESMA transação: uma falha no meio não pode deixar a conta removida
// com o e-mail ainda legível nos tickets, nem o contrário.

import { describe, it, expect, vi, beforeEach } from "vitest"

type Call = { model: string; op: string; args: Record<string, unknown> }
const transaction = vi.fn(async (ops: unknown) => ops)
const op = (model: string, name: string) => (args: Record<string, unknown>) =>
  ({ model, op: name, args }) satisfies Call

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (ops: unknown) => transaction(ops),
    feedback: { updateMany: op("feedback", "updateMany") },
    feedbackMessage: { updateMany: op("feedbackMessage", "updateMany") },
    catalogRequest: { updateMany: op("catalogRequest", "updateMany") },
    joinRequest: { updateMany: op("joinRequest", "updateMany") },
    user: { deleteMany: op("user", "deleteMany") },
  },
}))

const { ANONYMIZED_EMAIL, ANONYMIZED_NAME, deleteUserRecord } = await import("@/lib/user-deletion")

const USER = { id: "u-1", email: "Ana.Silva@Mares.org" }
const SAME_EMAIL = { equals: USER.email, mode: "insensitive" }

async function run() {
  await deleteUserRecord(USER)
  expect(transaction).toHaveBeenCalledTimes(1)
  return transaction.mock.calls[0]![0] as Call[]
}
const find = (calls: Call[], model: string) => calls.find((c) => c.model === model)!

beforeEach(() => transaction.mockClear())

describe("deleteUserRecord", () => {
  it("anonimiza e remove numa única transação, com a remoção por último", async () => {
    const calls = await run()
    expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
      "feedback.updateMany",
      "feedbackMessage.updateMany",
      "catalogRequest.updateMany",
      "joinRequest.updateMany",
      "user.deleteMany",
    ])
  })

  it.each([
    ["feedback", "createdById", "createdByEmail"],
    ["feedbackMessage", "createdById", "createdByEmail"],
    ["catalogRequest", "requestedById", "requestedByEmail"],
  ])(
    "%s: casa pelo id E pelo e-mail (sem diferenciar caixa) e troca só o e-mail",
    async (model, idField, emailField) => {
      const call = find(await run(), model)
      expect(call.args.where).toEqual({
        OR: [{ [idField]: USER.id }, { [emailField]: SAME_EMAIL }],
      })
      expect(call.args.data).toEqual({ [emailField]: ANONYMIZED_EMAIL })
    },
  )

  // A solicitação de acesso não referencia o usuário por id: só o e-mail a liga à pessoa.
  it("solicitação de acesso: casa pelo e-mail e anonimiza e-mail e nome", async () => {
    const call = find(await run(), "joinRequest")
    expect(call.args.where).toEqual({ email: SAME_EMAIL })
    expect(call.args.data).toEqual({ email: ANONYMIZED_EMAIL, requesterName: ANONYMIZED_NAME })
  })

  it("remove apenas o usuário informado", async () => {
    const call = find(await run(), "user")
    expect(call.args).toEqual({ where: { id: USER.id } })
  })

  it("o e-mail anônimo usa o domínio reservado .invalid (nunca pertence a alguém)", () => {
    expect(ANONYMIZED_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.invalid$/)
    expect(ANONYMIZED_NAME).not.toBe("")
  })

  it("falha da transação se propaga (nada é dado como excluído)", async () => {
    transaction.mockRejectedValueOnce(new Error("deadlock"))
    await expect(deleteUserRecord(USER)).rejects.toThrow("deadlock")
  })
})
