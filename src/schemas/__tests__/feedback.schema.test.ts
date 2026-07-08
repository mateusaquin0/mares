import { describe, it, expect } from "vitest"
import { createFeedbackSchema, updateFeedbackSchema } from "@/schemas/feedback.schema"

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

describe("updateFeedbackSchema", () => {
  it("aceita mudança só de status ou só de nota", () => {
    expect(updateFeedbackSchema.safeParse({ status: "RESOLVED" }).success).toBe(true)
    expect(updateFeedbackSchema.safeParse({ adminNote: "verificado" }).success).toBe(true)
  })

  it("rejeita payload vazio (nada a atualizar)", () => {
    expect(updateFeedbackSchema.safeParse({}).success).toBe(false)
  })

  it("rejeita status inválido", () => {
    expect(updateFeedbackSchema.safeParse({ status: "DONE" }).success).toBe(false)
  })
})
