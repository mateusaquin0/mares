import { describe, it, expect } from "vitest"
import { createFeedbackSchema, updateFeedbackSchema } from "@/schemas/feedback.schema"

describe("createFeedbackSchema", () => {
  it("aceita sugestão/bug com mensagem", () => {
    expect(
      createFeedbackSchema.safeParse({ type: "SUGGESTION", message: "ótima ideia" }).success,
    ).toBe(true)
    expect(createFeedbackSchema.safeParse({ type: "BUG", message: "quebrou aqui" }).success).toBe(
      true,
    )
  })

  it("rejeita tipo fora do domínio", () => {
    expect(createFeedbackSchema.safeParse({ type: "OUTRO", message: "x" }).success).toBe(false)
  })

  it("exige mensagem não vazia", () => {
    expect(createFeedbackSchema.safeParse({ type: "BUG", message: "" }).success).toBe(false)
    expect(createFeedbackSchema.safeParse({ type: "BUG", message: "   " }).success).toBe(false)
  })

  it("rejeita mensagem acima de 2000 caracteres", () => {
    expect(createFeedbackSchema.safeParse({ type: "BUG", message: "a".repeat(2001) }).success).toBe(
      false,
    )
  })

  it("aceita pageUrl opcional (inclusive vazia)", () => {
    expect(createFeedbackSchema.safeParse({ type: "BUG", message: "x", pageUrl: "" }).success).toBe(
      true,
    )
    expect(
      createFeedbackSchema.safeParse({ type: "BUG", message: "x", pageUrl: "/app/animals" })
        .success,
    ).toBe(true)
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
