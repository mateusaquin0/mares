// MARES — Cliente HTTP do lado do cliente (browser), sobre axios.
// Centraliza as chamadas: serializa JSON, trata erros e devolve o corpo já tipado.
// Os componentes NÃO chamam axios/fetch diretamente — usam os módulos de
// `src/services/*`, que por sua vez usam este cliente.

import axios, { type AxiosRequestConfig } from "axios"

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

// Instância única do axios. Sem Content-Type padrão: o axios infere
// `application/json` para objetos e `multipart/form-data` para FormData.
const client = axios.create()

// Opções extras suportadas nas chamadas (ex.: cancelamento via AbortSignal).
type RequestOptions = Pick<AxiosRequestConfig, "signal" | "headers" | "params">

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const res = await client.request<T>(config)
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      throw new ApiError(err.response.status, err.response.data)
    }
    // Rede, timeout ou cancelamento — sem resposta do servidor.
    throw new ApiError(0, null)
  }
}

export const http = {
  get: <T>(url: string, opts?: RequestOptions) => request<T>({ method: "GET", url, ...opts }),
  post: <T>(url: string, data?: unknown, opts?: RequestOptions) =>
    request<T>({ method: "POST", url, data, ...opts }),
  put: <T>(url: string, data?: unknown, opts?: RequestOptions) =>
    request<T>({ method: "PUT", url, data, ...opts }),
  patch: <T>(url: string, data?: unknown, opts?: RequestOptions) =>
    request<T>({ method: "PATCH", url, data, ...opts }),
  del: <T = void>(url: string, opts?: RequestOptions) =>
    request<T>({ method: "DELETE", url, ...opts }),
  // POST de FormData (upload) — o axios define o multipart/boundary automaticamente.
  postForm: <T>(url: string, form: FormData) => request<T>({ method: "POST", url, data: form }),
}
