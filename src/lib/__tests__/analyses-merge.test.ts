import { describe, it, expect } from "vitest"

import { mergeAnalysisCells } from "@/lib/analyses"

// Fusão da grade do servidor no estado editável da aba de análises. Cada teste é uma linha do
// tempo real: o que importa é se a resposta foi PEDIDA antes ou depois da escrita local, não
// quando ela chegou. Respostas pedidas antes trazem conteúdo mais velho que a gravação.

type Cell = { id?: string; result: string | null }

const cell = (result: string | null, id?: string): Cell => ({ id, result })
const guards = (e: Record<string, number>) => new Map(Object.entries(e))

describe("mergeAnalysisCells", () => {
  it("sem escrita local, o servidor manda", () => {
    const server = { a: cell("POSITIVO", "1"), b: cell("NEGATIVO", "2") }
    expect(mergeAnalysisCells(server, { a: cell("INCONCLUSIVO", "1") }, guards({}), 100)).toEqual(
      server,
    )
  })

  it("resposta PEDIDA antes da escrita não reverte a célula", () => {
    // GET pedido em t=100; usuário gravou NEGATIVO, concluído em t=150.
    const server = { a: cell("POSITIVO", "1") }
    const local = { a: cell("NEGATIVO", "1") }
    expect(mergeAnalysisCells(server, local, guards({ a: 150 }), 100)).toEqual({
      a: cell("NEGATIVO", "1"),
    })
  })

  it("resposta PEDIDA depois da escrita é aceita (o servidor volta a mandar)", () => {
    const server = { a: cell("POSITIVO", "1") }
    const local = { a: cell("NEGATIVO", "1") }
    expect(mergeAnalysisCells(server, local, guards({ a: 150 }), 200)).toEqual({
      a: cell("POSITIVO", "1"),
    })
  })

  it("save em voo (guarda Infinity) bloqueia qualquer resposta", () => {
    const server = { a: cell("POSITIVO", "1") }
    const local = { a: cell("NEGATIVO", "1") }
    const g = guards({ a: Number.POSITIVE_INFINITY })
    expect(mergeAnalysisCells(server, local, g, Number.MAX_SAFE_INTEGER)).toEqual({
      a: cell("NEGATIVO", "1"),
    })
  })

  // A falha que a primeira versão desta correção ainda tinha: a célula nasceu DEPOIS de a
  // resposta ser pedida, então ela não vem no payload — e era descartada da tela.
  it("célula criada depois do pedido não é descartada pela resposta velha", () => {
    const server: Record<string, Cell> = {}
    const local = { nova: cell("POSITIVO", "9") }
    expect(mergeAnalysisCells(server, local, guards({ nova: 150 }), 100)).toEqual({
      nova: cell("POSITIVO", "9"),
    })
  })

  // Espelho do caso acima: remover o lançamento é estado também.
  it("lançamento removido não é ressuscitado por resposta velha", () => {
    const server = { a: cell("POSITIVO", "1") }
    expect(mergeAnalysisCells(server, {}, guards({ a: 150 }), 100)).toEqual({})
  })

  it("remoção já refletida pelo servidor continua removida", () => {
    expect(mergeAnalysisCells({}, {}, guards({ a: 150 }), 200)).toEqual({})
  })

  it("guarda de uma célula não protege as vizinhas", () => {
    const server = { a: cell("POSITIVO", "1"), b: cell("POSITIVO", "2") }
    const local = { a: cell("NEGATIVO", "1"), b: cell("NEGATIVO", "2") }
    expect(mergeAnalysisCells(server, local, guards({ a: 150 }), 100)).toEqual({
      a: cell("NEGATIVO", "1"),
      b: cell("POSITIVO", "2"),
    })
  })

  it("não muta os mapas recebidos", () => {
    const server = { a: cell("POSITIVO", "1") }
    const local = { a: cell("NEGATIVO", "1") }
    mergeAnalysisCells(server, local, guards({ a: 150 }), 100)
    expect(server).toEqual({ a: cell("POSITIVO", "1") })
    expect(local).toEqual({ a: cell("NEGATIVO", "1") })
  })

  it("linha nova vinda do servidor entra mesmo havendo guarda em outra célula", () => {
    const server = { a: cell("POSITIVO", "1"), nova: cell("NEGATIVO", "3") }
    const local = { a: cell("NEGATIVO", "1") }
    expect(mergeAnalysisCells(server, local, guards({ a: 150 }), 100)).toEqual({
      a: cell("NEGATIVO", "1"),
      nova: cell("NEGATIVO", "3"),
    })
  })
})
