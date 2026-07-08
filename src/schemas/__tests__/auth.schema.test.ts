import { describe, it, expect } from "vitest"
import { loginSchema, setPasswordSchema, changePasswordSchema } from "@/schemas/auth.schema"

describe("loginSchema", () => {
  it("aceita e-mail válido e senha com 6+ caracteres", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "secret" }).success).toBe(true)
  })

  it("rejeita e-mail inválido", () => {
    expect(loginSchema.safeParse({ email: "a", password: "secret" }).success).toBe(false)
  })

  it("rejeita senha com menos de 6 caracteres", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "123" }).success).toBe(false)
  })
})

describe("setPasswordSchema", () => {
  const valid = { password: "supersegura", confirm: "supersegura", acceptTerms: true }

  it("aceita senhas iguais (8+) com termos aceitos", () => {
    expect(setPasswordSchema.safeParse(valid).success).toBe(true)
  })

  it("rejeita senha com menos de 8 caracteres", () => {
    expect(setPasswordSchema.safeParse({ ...valid, password: "curta1", confirm: "curta1" }).success).toBe(false)
  })

  it("rejeita quando a confirmação não bate", () => {
    const res = setPasswordSchema.safeParse({ ...valid, confirm: "outra-coisa" })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes("confirm"))).toBe(true)
    }
  })

  it("exige aceite dos termos", () => {
    expect(setPasswordSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("valida confirmação sem exigir termos", () => {
    expect(changePasswordSchema.safeParse({ password: "novasenha8", confirm: "novasenha8" }).success).toBe(true)
    expect(changePasswordSchema.safeParse({ password: "novasenha8", confirm: "x" }).success).toBe(false)
  })
})
