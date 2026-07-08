// MARES — Utilitários para Route Handlers: mapeia erros de domínio em respostas HTTP.

import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export function apiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: err.flatten(), code: ERROR_CODES.validation },
      { status: 422 },
    )
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 422 })
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 403 })
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 404 })
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
  }
  if (err instanceof ServiceUnavailableError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 503 })
  }
  console.error("[api] erro não tratado:", err)
  return NextResponse.json({ error: "Erro interno", code: ERROR_CODES.internal }, { status: 500 })
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Não autenticado", code: ERROR_CODES.unauthenticated },
    { status: 401 },
  )
}

// Proteção CSRF para requisições que não passam por preflight CORS (ex.: uploads
// multipart/form-data, que são "simple requests"). Exige que a origem da requisição
// seja a própria aplicação. Requisições JSON já são protegidas pelo preflight que o
// Content-Type: application/json força; o SameSite=Lax do cookie é a segunda barreira.
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin")
  const host = req.headers.get("host")
  // Sem Origin (ex.: navegação same-origin antiga) cai para o Referer.
  if (!origin) {
    const referer = req.headers.get("referer")
    if (referer && host) {
      try {
        if (new URL(referer).host === host) return
      } catch {
        /* referer malformado → bloqueia abaixo */
      }
    }
    throw new ForbiddenError("Origem não permitida", ERROR_CODES.forbidden)
  }
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ForbiddenError("Origem inválida", ERROR_CODES.forbidden)
  }
  if (originHost !== host) {
    throw new ForbiddenError("Origem não permitida", ERROR_CODES.forbidden)
  }
}

// 429 — cliente excedeu o limite de requisições (ver src/lib/rate-limit.ts).
// Inclui o header padrão `Retry-After` (em segundos).
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Muitas requisições. Aguarde um momento.", code: ERROR_CODES.rateLimited },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  )
}
