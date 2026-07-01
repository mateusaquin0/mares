// MARES — Utilitários para Route Handlers: mapeia erros de domínio em respostas HTTP.

import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export function apiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: err.flatten(), code: ERROR_CODES.validation }, { status: 422 })
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
  console.error("[api] erro não tratado:", err)
  return NextResponse.json({ error: "Erro interno", code: ERROR_CODES.internal }, { status: 500 })
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Não autenticado", code: ERROR_CODES.unauthenticated },
    { status: 401 }
  )
}
