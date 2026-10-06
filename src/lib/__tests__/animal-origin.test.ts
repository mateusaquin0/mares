// Cenário que estes testes protegem: o detalhe do indivíduo é alcançado pela lista de animais,
// pela grade de resultados e pelo mapa, mas o "voltar" apontava sempre para a lista — quem vinha
// dos resultados caía em /app/animals. A origem viaja na URL, então um link direto (ou adulterado)
// não pode virar destino: o desconhecido cai na lista.

import { describe, it, expect } from "vitest"
import { animalHref, animalBackTo } from "@/lib/animal-origin"

describe("animalHref", () => {
  it("sem origem, é o link puro do detalhe", () => {
    expect(animalHref("a-1")).toBe("/app/animals/a-1")
  })

  it("com origem, marca de onde a pessoa veio", () => {
    expect(animalHref("a-1", "results")).toBe("/app/animals/a-1?from=results")
    expect(animalHref("a-1", "map")).toBe("/app/animals/a-1?from=map")
  })

  it("escapa o id no caminho", () => {
    expect(animalHref("a/1", "map")).toBe("/app/animals/a%2F1?from=map")
  })
})

describe("animalBackTo", () => {
  it("devolve a tela de origem", () => {
    expect(animalBackTo("results")).toEqual({ href: "/app/results", labelKey: "backToResults" })
    expect(animalBackTo("map")).toEqual({ href: "/app/map", labelKey: "backToMap" })
  })

  it("sem origem (link direto), cai na lista de animais", () => {
    expect(animalBackTo(undefined)).toEqual({ href: "/app/animals", labelKey: "back" })
    expect(animalBackTo(null)).toEqual({ href: "/app/animals", labelKey: "back" })
  })

  it("origem desconhecida não vira destino", () => {
    expect(animalBackTo("dashboard")).toEqual({ href: "/app/animals", labelKey: "back" })
    expect(animalBackTo("https://exemplo.com")).toEqual({
      href: "/app/animals",
      labelKey: "back",
    })
    expect(animalBackTo("constructor")).toEqual({ href: "/app/animals", labelKey: "back" })
  })

  // `?from=a&from=b` chega como array — não é uma origem, e o fallback vale igual.
  it("parâmetro repetido cai na lista de animais", () => {
    expect(animalBackTo(["results", "map"])).toEqual({ href: "/app/animals", labelKey: "back" })
  })
})
