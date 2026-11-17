// Prisma simulado para os testes unitários dos módulos que consultam o banco.
//
// Cada `prisma.<modelo>.<método>` vira um `vi.fn()` criado sob demanda; o teste programa a
// resposta com `m("animal", "findUnique").mockResolvedValue(...)` e confere a chamada pelo
// mesmo acessor. O alvo destes testes é a LÓGICA em volta da consulta (ramificações, erros de
// domínio, o `where` montado) — o comportamento do banco é dos testes de integração.
//
// Uso:
//   vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

import { vi, type Mock } from "vitest"
import { Prisma } from "@prisma/client"

const models = new Map<string, Map<string, Mock>>()
const roots = new Map<string, Mock>()

/** Mock de `prisma.<model>.<method>`. */
export function m(model: string, method: string): Mock {
  let methods = models.get(model)
  if (!methods) models.set(model, (methods = new Map()))
  let fn = methods.get(method)
  if (!fn) methods.set(method, (fn = vi.fn()))
  return fn
}

/** Mock de um método da raiz do client (`$transaction`, `$queryRaw`, `$executeRaw`). */
export function root(name: string): Mock {
  let fn = roots.get(name)
  if (!fn) roots.set(name, (fn = vi.fn()))
  return fn
}

const modelProxy = (model: string) =>
  new Proxy(
    {},
    { get: (_t, method) => (typeof method === "string" ? m(model, method) : undefined) },
  )

export const db: unknown = new Proxy(
  {},
  {
    get: (_t, name) => {
      if (typeof name !== "string" || name === "then") return undefined
      return name.startsWith("$") ? root(name) : modelProxy(name)
    },
  },
)

// `$transaction` aceita as duas formas do Prisma: callback (recebe o próprio client simulado
// como `tx`) e lista de operações já disparadas.
function installTransaction() {
  root("$transaction").mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(db)
      : Promise.all(arg as unknown[]),
  )
}
installTransaction()

/** Zera chamadas e respostas programadas de todos os mocks (use no `beforeEach`). */
export function resetDb() {
  for (const methods of models.values()) for (const fn of methods.values()) fn.mockReset()
  for (const fn of roots.values()) fn.mockReset()
  installTransaction()
}

/** Erro conhecido do Prisma (P2002 = unicidade, P2025 = registro inexistente). */
export function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`Prisma ${code}`, {
    code,
    clientVersion: "test",
    meta,
  })
}

/** Primeiro argumento da n-ésima chamada (padrão: a primeira). */
export function arg<T = Record<string, unknown>>(fn: Mock, call = 0): T {
  return fn.mock.calls[call]![0] as T
}

export const prismaModule = { prisma: db }
