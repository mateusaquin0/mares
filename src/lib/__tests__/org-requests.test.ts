// Cenário que estes testes protegem: a criação de grupo de pesquisa só existia pela porta
// pública (`/request-access`), feita para quem ainda não tem cadastro. Quem já usa o sistema
// precisava sair da aplicação e preencher o formulário público com o próprio e-mail. A tela
// "Meus grupos de pesquisa" passa a abrir a MESMA solicitação (`JoinRequest`) de dentro, com o
// solicitante saindo da sessão — e estas são as duas recusas que a regra precisa manter.

import { describe, it, expect } from "vitest"

import { assertCanRequestOrg } from "@/lib/org-requests"
import { ERROR_CODES } from "@/lib/error-codes"

const researcher = { email: "bio@ufsc.br", isSystemAdmin: false }

describe("assertCanRequestOrg — quem pode pedir um novo grupo", () => {
  // `hasPendingRequest` é calculado por quem chama, filtrando status PENDING: ter criado um
  // grupo antes (APPROVED) ou ter sido recusado (REJECTED) não impede pedir outro.
  it("deixa passar um usuário comum sem solicitação em aberto", () => {
    expect(() => assertCanRequestOrg(researcher, false)).not.toThrow()
  })

  // O admin da aplicação não participa de grupos (o isSystemAdmin já lhe dá acesso a todos), e
  // `provisionMembership` recusaria o vínculo na aprovação: a solicitação nasceria impossível.
  it("recusa o admin da aplicação", () => {
    expect(() =>
      assertCanRequestOrg({ email: "adm@mares.app", isSystemAdmin: true }, false),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.systemAdminNoOrg }))
  })

  // Sem isto, um clique repetido vira uma fila de pedidos idênticos — e cada aprovação criaria
  // um grupo a mais.
  it("recusa uma segunda solicitação enquanto a primeira aguarda análise", () => {
    expect(() => assertCanRequestOrg(researcher, true)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.joinRequestPending }),
    )
  })
})
