import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CATALOG_TYPES, REQUEST_TYPE_BY_CATALOG } from "@/schemas/catalog.schema"

// A fila de curadoria monta o rótulo do tipo em template string — `t(\`type_${r.type}\`)` em
// my-requests.tsx e requests-review.tsx. Chave assim é invisível para o TypeScript: acrescentar
// um tipo de catálogo compila, passa no lint e só quebra em runtime, na tela que o dev não
// abriu. Foi exatamente o que aconteceu ao acrescentar "systems" (MISSING_MESSAGE type_SYSTEM).
//
// Este teste amarra os dois lados: para cada CatalogType tem de existir o rótulo nos dois
// idiomas. O nome do enum vem de REQUEST_TYPE_BY_CATALOG — o MESMO mapa que o código usa,
// para o teste não depender de adivinhar a transformação (os tipos são plurais e os valores
// do enum, singulares).

const LOCALES = ["pt", "en"] as const

function messages(locale: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf-8"))
}

describe("i18n dos tipos de solicitação de glossário", () => {
  it("cobre os tipos de catálogo conhecidos (guarda contra a lista esvaziar)", () => {
    expect(CATALOG_TYPES.length).toBeGreaterThanOrEqual(4)
    expect(CATALOG_TYPES).toContain("systems")
  })

  for (const locale of LOCALES) {
    it(`${locale}.catalogRequests tem um rótulo para cada tipo`, () => {
      const ns = messages(locale).catalogRequests ?? {}
      const missing = CATALOG_TYPES.map((t) => `type_${REQUEST_TYPE_BY_CATALOG[t]}`).filter(
        (k) => !(k in ns),
      )
      expect(missing).toEqual([])
    })
  }
})
