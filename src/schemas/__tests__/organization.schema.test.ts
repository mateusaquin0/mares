import { describe, it, expect } from "vitest"
import {
  accessRequestSchema,
  addMemberSchema,
  updateMemberRoleSchema,
} from "@/schemas/organization.schema"

describe("accessRequestSchema", () => {
  const valid = {
    email: "pesquisador@univ.br",
    requesterName: "Ana",
    organizationName: "Lab de Fauna Marinha",
    acceptTerms: true,
  }

  it("aceita uma solicitação válida", () => {
    expect(accessRequestSchema.safeParse(valid).success).toBe(true)
  })

  it("rejeita e-mail inválido", () => {
    expect(accessRequestSchema.safeParse({ ...valid, email: "não-é-email" }).success).toBe(false)
  })

  it("exige nome do solicitante com pelo menos 2 caracteres", () => {
    expect(accessRequestSchema.safeParse({ ...valid, requesterName: "A" }).success).toBe(false)
  })

  it("exige nome da organização com pelo menos 3 caracteres", () => {
    expect(accessRequestSchema.safeParse({ ...valid, organizationName: "ab" }).success).toBe(false)
  })

  it("exige aceite dos termos (true)", () => {
    expect(accessRequestSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false)
  })
})

describe("addMemberSchema", () => {
  it("aceita só e-mail (nome é exigido pelo servidor, não pelo schema)", () => {
    expect(addMemberSchema.safeParse({ email: "novo@lab.br" }).success).toBe(true)
  })

  it("aceita papel válido e rejeita papel desconhecido", () => {
    expect(addMemberSchema.safeParse({ email: "user@example.com", role: "RESEARCHER" }).success).toBe(true)
    expect(addMemberSchema.safeParse({ email: "user@example.com", role: "SUPERUSER" }).success).toBe(false)
  })
})

describe("updateMemberRoleSchema", () => {
  it("exige um papel do domínio", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "ORG_ADMIN" }).success).toBe(true)
    expect(updateMemberRoleSchema.safeParse({ role: "" }).success).toBe(false)
  })
})
