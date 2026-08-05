// MARES — Erros de domínio
// Services lançam estes erros; as API Routes os convertem em respostas HTTP.
// Cada erro carrega um `code` estável (ver src/lib/error-codes.ts) para o cliente traduzir.

import { ERROR_CODES } from "@/lib/error-codes"

export class NotFoundError extends Error {
  code: string
  constructor(message = "Não encontrado", code: string = ERROR_CODES.notFound) {
    super(message)
    this.name = "NotFoundError"
    this.code = code
  }
}

export class ConflictError extends Error {
  code: string
  // Valores interpolados na mensagem traduzida do cliente (ICU: `{research}`). Trafegam
  // no corpo do erro para que o servidor não precise conhecer o idioma. Ver docs/I18N.md.
  params?: Record<string, string>
  constructor(
    message = "Conflito de dados",
    code: string = ERROR_CODES.conflict,
    params?: Record<string, string>,
  ) {
    super(message)
    this.name = "ConflictError"
    this.code = code
    this.params = params
  }
}

export class ForbiddenError extends Error {
  code: string
  constructor(message = "Sem permissão", code: string = ERROR_CODES.forbidden) {
    super(message)
    this.name = "ForbiddenError"
    this.code = code
  }
}

export class ValidationError extends Error {
  code: string
  constructor(message = "Dados inválidos", code: string = ERROR_CODES.validation) {
    super(message)
    this.name = "ValidationError"
    this.code = code
  }
}

// Serviço externo (ex.: SIMBA) indisponível ou com resposta inesperada → 503.
export class ServiceUnavailableError extends Error {
  code: string
  constructor(message = "Serviço indisponível", code: string = ERROR_CODES.internal) {
    super(message)
    this.name = "ServiceUnavailableError"
    this.code = code
  }
}
