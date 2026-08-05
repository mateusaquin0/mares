import { describe, it, expect } from "vitest"
import {
  FEEDBACK_RESOLUTION_MAX,
  FEEDBACK_RESOLUTION_MIN,
  createFeedbackSchema,
  updateFeedbackSchema,
  updateMyFeedbackSchema,
} from "@/schemas/feedback.schema"

const valid = { type: "SUGGESTION" as const, title: "Ideia", message: "ótima ideia" }

describe("createFeedbackSchema", () => {
  it("aceita sugestão/bug com título e mensagem", () => {
    expect(createFeedbackSchema.safeParse(valid).success).toBe(true)
    expect(
      createFeedbackSchema.safeParse({ type: "BUG", title: "Erro", message: "quebrou aqui" })
        .success,
    ).toBe(true)
  })

  it("rejeita tipo fora do domínio", () => {
    expect(createFeedbackSchema.safeParse({ ...valid, type: "OUTRO" }).success).toBe(false)
  })

  it("exige título não vazio", () => {
    expect(createFeedbackSchema.safeParse({ ...valid, title: "" }).success).toBe(false)
    expect(createFeedbackSchema.safeParse({ ...valid, title: "   " }).success).toBe(false)
  })

  it("rejeita título acima de 100 caracteres", () => {
    expect(createFeedbackSchema.safeParse({ ...valid, title: "a".repeat(101) }).success).toBe(false)
    expect(createFeedbackSchema.safeParse({ ...valid, title: "a".repeat(100) }).success).toBe(true)
  })

  it("exige mensagem não vazia", () => {
    expect(createFeedbackSchema.safeParse({ ...valid, message: "" }).success).toBe(false)
    expect(createFeedbackSchema.safeParse({ ...valid, message: "   " }).success).toBe(false)
  })

  it("rejeita mensagem acima de 500 caracteres", () => {
    expect(createFeedbackSchema.safeParse({ ...valid, message: "a".repeat(501) }).success).toBe(
      false,
    )
    expect(createFeedbackSchema.safeParse({ ...valid, message: "a".repeat(500) }).success).toBe(
      true,
    )
  })

  it("aceita pageUrl opcional (inclusive vazia)", () => {
    expect(createFeedbackSchema.safeParse({ ...valid, pageUrl: "" }).success).toBe(true)
    expect(createFeedbackSchema.safeParse({ ...valid, pageUrl: "/app/animals" }).success).toBe(true)
  })
})

describe("updateMyFeedbackSchema", () => {
  const edit = { type: "BUG" as const, title: "Corrigido", message: "texto novo" }

  it("aceita tipo, título e mensagem", () => {
    expect(updateMyFeedbackSchema.safeParse(edit).success).toBe(true)
  })

  it("herda os limites do envio", () => {
    expect(updateMyFeedbackSchema.safeParse({ ...edit, title: "" }).success).toBe(false)
    expect(updateMyFeedbackSchema.safeParse({ ...edit, message: "   " }).success).toBe(false)
    expect(updateMyFeedbackSchema.safeParse({ ...edit, title: "a".repeat(101) }).success).toBe(
      false,
    )
  })

  it("ignora pageUrl (contexto de origem, não conteúdo editável)", () => {
    const parsed = updateMyFeedbackSchema.parse({ ...edit, pageUrl: "/app/animals" })
    expect(parsed).not.toHaveProperty("pageUrl")
  })

  it("não aceita status nem as notas do admin", () => {
    const parsed = updateMyFeedbackSchema.parse({
      ...edit,
      status: "RESOLVED",
      resolutionNote: "x",
      adminNote: "y",
    })
    expect(parsed).toEqual(edit)
  })
})

describe("updateFeedbackSchema", () => {
  const justification = "Fora do escopo do projeto por ora."

  it("aceita mudança só de status, só de nota interna ou só de resposta ao autor", () => {
    expect(updateFeedbackSchema.safeParse({ status: "RESOLVED" }).success).toBe(true)
    expect(updateFeedbackSchema.safeParse({ adminNote: "verificado" }).success).toBe(true)
    expect(updateFeedbackSchema.safeParse({ resolutionNote: justification }).success).toBe(true)
  })

  it("rejeita payload vazio (nada a atualizar)", () => {
    expect(updateFeedbackSchema.safeParse({}).success).toBe(false)
  })

  it("rejeita status inválido", () => {
    expect(updateFeedbackSchema.safeParse({ status: "DONE" }).success).toBe(false)
  })

  it("descarte com justificativa válida passa", () => {
    expect(
      updateFeedbackSchema.safeParse({ status: "WONT_FIX", resolutionNote: justification }).success,
    ).toBe(true)
  })

  it("descarte com justificativa vazia ou curta é rejeitado", () => {
    for (const resolutionNote of ["", "   ", "não", "a".repeat(FEEDBACK_RESOLUTION_MIN - 1)]) {
      expect(updateFeedbackSchema.safeParse({ status: "WONT_FIX", resolutionNote }).success).toBe(
        false,
      )
    }
    expect(
      updateFeedbackSchema.safeParse({ status: "WONT_FIX", resolutionNote: null }).success,
    ).toBe(false)
  })

  it("descarte SEM enviar a justificativa passa no schema (o estado salvo é checado no servidor)", () => {
    // A nota pode já estar gravada; quem decide é assertResolutionNote (src/lib/feedback.ts).
    expect(updateFeedbackSchema.safeParse({ status: "WONT_FIX" }).success).toBe(true)
  })

  it("resposta ao autor respeita o limite de caracteres", () => {
    expect(
      updateFeedbackSchema.safeParse({ resolutionNote: "a".repeat(FEEDBACK_RESOLUTION_MAX) })
        .success,
    ).toBe(true)
    expect(
      updateFeedbackSchema.safeParse({ resolutionNote: "a".repeat(FEEDBACK_RESOLUTION_MAX + 1) })
        .success,
    ).toBe(false)
  })

  it("nos demais status a resposta pode ser curta ou apagada", () => {
    expect(
      updateFeedbackSchema.safeParse({ status: "RESOLVED", resolutionNote: "ok" }).success,
    ).toBe(true)
    expect(updateFeedbackSchema.safeParse({ status: "NEW", resolutionNote: null }).success).toBe(
      true,
    )
  })
})
