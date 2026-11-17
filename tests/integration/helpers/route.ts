import { NextRequest } from "next/server"
import type { AuthUser } from "@/lib/auth"

// Apoio para chamar os route handlers reais nos testes de integração.
//
// Só a ORIGEM da sessão é substituída (tests/integration/setup.ts): `getAuthUser` devolve o
// usuário definido por `login` e `getActiveOrgId` a organização ativa. Papéis, escopo por
// pesquisa, validação e consultas ao banco são os do código de produção.

type Session = { user: AuthUser | null; orgId: string | null }

const holder = globalThis as unknown as { __maresSession?: Session }

export function currentSession(): Session {
  return (holder.__maresSession ??= { user: null, orgId: null })
}

type Role = "RESEARCHER" | "ORG_ADMIN"

/** Usuário de sessão com vínculo em uma ou mais organizações. O `id` deve existir em "User". */
export function member(
  id: string,
  memberships: { orgId: string; role: Role }[] | [string, Role],
  over: Partial<AuthUser> = {},
): AuthUser {
  const list =
    typeof memberships[0] === "string"
      ? [{ orgId: memberships[0], role: memberships[1] as Role }]
      : (memberships as { orgId: string; role: Role }[])
  return {
    id,
    email: `${id}@test.local`,
    name: "Teste",
    isSystemAdmin: false,
    memberships: list.map((m) => ({ orgId: m.orgId, orgName: "Org", role: m.role })),
    ...over,
  }
}

/** Admin global: não pertence a organização alguma. */
export function systemAdmin(id: string, over: Partial<AuthUser> = {}): AuthUser {
  return {
    id,
    email: `${id}@test.local`,
    name: "Admin global",
    isSystemAdmin: true,
    memberships: [],
    ...over,
  }
}

/**
 * Define a sessão das próximas chamadas. `null` = sem sessão (401).
 * A organização ativa é a primeira do usuário, salvo `activeOrgId` explícito.
 */
export function login(user: AuthUser | null, activeOrgId?: string | null) {
  const session = currentSession()
  session.user = user
  session.orgId = activeOrgId !== undefined ? activeOrgId : (user?.memberships[0]?.orgId ?? null)
}

type Init = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  // Corpo JSON. Para multipart, passe `form`.
  body?: unknown
  form?: FormData
  headers?: Record<string, string>
}

/** Requisição para um handler. `path` pode levar query string. */
export function req(path: string, init: Init = {}): NextRequest {
  const headers: Record<string, string> = { host: "localhost", ...init.headers }
  if (init.form) {
    // Uploads passam pela checagem de mesma origem (assertSameOrigin).
    headers.origin ??= "http://localhost"
    return new NextRequest(`http://localhost${path}`, {
      method: init.method ?? "POST",
      body: init.form,
      headers,
    })
  }
  if (init.body !== undefined) {
    return new NextRequest(`http://localhost${path}`, {
      method: init.method ?? "POST",
      body: JSON.stringify(init.body),
      headers: { "content-type": "application/json", ...headers },
    })
  }
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", headers })
}

/** Segundo argumento dos handlers com segmento dinâmico: `ctx({ id })`. */
export function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}

/** Corpo JSON da resposta, tipado pelo chamador. */
export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T
}
