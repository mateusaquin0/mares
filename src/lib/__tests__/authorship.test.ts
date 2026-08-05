import { describe, it, expect } from "vitest"
import { canDeleteAuthored } from "@/lib/authorship"

// Regra de exclusão por autoria (docs/PERMISSOES.md §Amostras e §Mídia). O mesmo predicado
// decide na rota e na tela, então os casos aqui valem para os dois lados.
describe("canDeleteAuthored", () => {
  const me = "user-1"
  const other = "user-2"

  it("libera o admin da organização, mesmo em registro de outra pessoa", () => {
    expect(canDeleteAuthored({ isOrgAdmin: true, selfId: me, authorId: other })).toBe(true)
  })

  it("libera o próprio autor", () => {
    expect(canDeleteAuthored({ isOrgAdmin: false, selfId: me, authorId: me })).toBe(true)
  })

  it("libera registro órfão (sem autor) para quem não é admin", () => {
    expect(canDeleteAuthored({ isOrgAdmin: false, selfId: me, authorId: null })).toBe(true)
  })

  it("barra quem não é admin nem autor", () => {
    expect(canDeleteAuthored({ isOrgAdmin: false, selfId: me, authorId: other })).toBe(false)
  })

  it("não confunde ausência de autor com ausência de usuário", () => {
    // selfId nulo não deveria acontecer nas telas autenticadas, mas se acontecer o órfão
    // continua liberado e o registro com autor continua barrado — nunca o contrário.
    expect(canDeleteAuthored({ isOrgAdmin: false, selfId: null, authorId: null })).toBe(true)
    expect(canDeleteAuthored({ isOrgAdmin: false, selfId: null, authorId: other })).toBe(false)
  })
})
