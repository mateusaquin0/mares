// MARES — Cliente HTTP do lado do cliente (browser).
// Centraliza as chamadas fetch: serializa JSON, trata erros e devolve o corpo já
// tipado. Os componentes NÃO devem chamar fetch diretamente — usam os módulos de
// `src/services/*`, que por sua vez usam este cliente.

// Erro de uma resposta HTTP não-OK. Carrega o corpo (JSON de erro do servidor:
// `{ error, code }`) para que a UI o traduza via useErrorMessage.
export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

// Devolve o corpo de erro tratável pela UI (útil em blocos catch).
export function apiErrorBody(err: unknown): unknown {
  return err instanceof ApiError ? err.body : null
}

type Body = unknown

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const isJson = res.headers.get("content-type")?.includes("application/json")
  const body = isJson ? await res.json().catch(() => null) : null

  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

function jsonInit(method: string, data?: Body, init?: RequestInit): RequestInit {
  return {
    ...init,
    method,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  }
}

export const http = {
  get: <T>(url: string, init?: RequestInit) => request<T>(url, init),
  post: <T>(url: string, data?: Body, init?: RequestInit) =>
    request<T>(url, jsonInit("POST", data, init)),
  put: <T>(url: string, data?: Body, init?: RequestInit) =>
    request<T>(url, jsonInit("PUT", data, init)),
  patch: <T>(url: string, data?: Body, init?: RequestInit) =>
    request<T>(url, jsonInit("PATCH", data, init)),
  del: <T = void>(url: string, init?: RequestInit) =>
    request<T>(url, { ...init, method: "DELETE" }),
  // POST de FormData (upload) — não define Content-Type (o browser cuida do boundary).
  postForm: <T>(url: string, form: FormData) =>
    request<T>(url, { method: "POST", body: form }),
}
