import { PrismaClient } from "@prisma/client"
import { vi } from "vitest"

// Trava contra limpeza sem filtro. Para o Prisma, `where: { id: undefined }` é o mesmo que
// `where: {}`: um `afterAll` que rode depois de um `beforeAll` interrompido — com os ids ainda
// indefinidos — apagaria a TABELA INTEIRA. Já aconteceu: uma falha de setup levou embora o
// catálogo de órgãos do banco de testes, que também guarda os dados fictícios de demonstração.
//
// Aqui todo `deleteMany`/`updateMany` sem filtro, ou com `undefined` em qualquer nível do
// filtro, é recusado antes de chegar ao banco. Vale para os testes e para o código sob teste.

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true
  if (value === null || typeof value !== "object" || value instanceof Date) return false
  return Object.values(value).some(hasUndefined)
}

function assertFiltered(model: string, operation: string, where: unknown) {
  const empty = where == null || (typeof where === "object" && Object.keys(where).length === 0)
  if (empty || hasUndefined(where)) {
    throw new Error(
      `${model}.${operation} recusado nos testes de integração: filtro vazio ou com valor ` +
        "indefinido alcançaria todas as linhas da tabela.",
    )
  }
}

const guarded = new PrismaClient({ log: ["error"] }).$extends({
  query: {
    $allModels: {
      deleteMany({ model, args, query }) {
        assertFiltered(model, "deleteMany", args.where)
        return query(args)
      },
      updateMany({ model, args, query }) {
        assertFiltered(model, "updateMany", args.where)
        return query(args)
      },
    },
  },
})

// src/lib/prisma.ts reaproveita a instância guardada em `globalThis`; registrá-la antes de
// qualquer import faz toda a suíte (e o código sob teste) usar o cliente com a trava.
;(globalThis as unknown as { prisma?: unknown }).prisma = guarded

// ── Fronteiras substituídas em TODA a suíte ──────────────────────────────────────────────
// Só o que não existe fora de uma requisição do Next, ou que sairia do banco de testes:
//   • sessão: `getAuthUser`/`getActiveOrgId` leem o usuário definido por helpers/route.ts
//     (`login`); papéis e escopo continuam sendo os de src/lib/auth.ts;
//   • Supabase com service role (convites, exclusão no Auth, Storage): substituto em memória —
//     nenhum teste envia e-mail nem grava arquivo de verdade (helpers/supabase-fake.ts);
//   • `react.cache`, `next-intl/server` e `next/cache`, que dependem do runtime do Next.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}))
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pt",
  getTranslations: async () => (key: string) => key,
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock("@/lib/auth", async (importOriginal) => {
  const { currentSession } = await import("./helpers/route")
  return {
    ...(await importOriginal<typeof import("@/lib/auth")>()),
    getAuthUser: async () => currentSession().user,
    getActiveOrgId: async () => currentSession().orgId,
  }
})
vi.mock("@/lib/supabase/admin", async () => await import("./helpers/supabase-fake"))
