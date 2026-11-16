import { PrismaClient } from "@prisma/client"

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
