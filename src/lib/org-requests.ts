// MARES — Solicitação de criação de um NOVO grupo de pesquisa por quem já tem conta.
//
// O fluxo de criação de grupo já existia, mas só pela porta pública (`/request-access`), pensada
// para quem ainda NÃO tem cadastro: a pessoa informa nome, e-mail e o grupo, e o admin da
// aplicação aprova. Quem já usa o sistema não tinha porta nenhuma — precisava sair, preencher o
// formulário público com o próprio e-mail e esperar. Esta é a mesma solicitação (`JoinRequest`),
// aberta de dentro da aplicação, com o solicitante vindo da SESSÃO.
//
// A aprovação continua sendo a mesma rota do admin global (POST /api/admin/access-requests/[id]/
// approve): cria a organização e vincula quem pediu como ORG_ADMIN. Nada muda lá — é justamente
// o ponto de reaproveitar o modelo em vez de criar um segundo caminho de criação de grupo.

import { ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

// O que a regra precisa saber de quem pede — nem AuthUser inteiro, nem o Prisma.
export type OrgRequester = { email: string; isSystemAdmin: boolean }

/**
 * Decide se `requester` pode abrir uma solicitação de novo grupo.
 *
 * Duas recusas, por motivos diferentes:
 *
 *   • **admin da aplicação** — não participa de grupos (o `isSystemAdmin` já lhe dá acesso a
 *     todos), e `provisionMembership` recusaria o vínculo na aprovação. Barrar aqui evita
 *     produzir uma solicitação que nasceria impossível de aprovar.
 *   • **solicitação em aberto** — uma por vez. Sem isso, um clique repetido vira uma fila de
 *     pedidos idênticos para o admin analisar, e cada aprovação criaria um grupo a mais.
 *
 * Pedidos já APROVADOS ou REJEITADOS não bloqueiam: ter criado um grupo antes (ou ter sido
 * recusado) não impede pedir outro.
 */
export function assertCanRequestOrg(requester: OrgRequester, hasPendingRequest: boolean): void {
  if (requester.isSystemAdmin) {
    throw new ForbiddenError(
      "Administradores da aplicação não participam de grupos de pesquisa",
      ERROR_CODES.systemAdminNoOrg,
    )
  }
  if (hasPendingRequest) {
    throw new ConflictError(
      "Você já tem uma solicitação de grupo aguardando análise",
      ERROR_CODES.joinRequestPending,
    )
  }
}
