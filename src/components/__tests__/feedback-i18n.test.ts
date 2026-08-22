import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// O diálogo de ticket é UM componente servindo dois namespaces de i18n ("Meus envios" e a
// triagem), que têm as mesmas chaves com textos diferentes. Nada no TypeScript amarra isso:
// uma chave que só existe em um dos dois só quebra em runtime, e só na tela que o dev não
// abriu. Este teste lê as chaves que os componentes compartilhados realmente pedem e exige
// que as duas telas — nos dois idiomas — as tenham.

const LOCALES = ["pt", "en"] as const
const SHARED_NAMESPACES = ["myFeedback", "adminFeedback"] as const
// O seletor de imagens serve também ao diálogo de envio, que tem namespace próprio.
const PICKER_NAMESPACES = ["myFeedback", "adminFeedback", "feedback"] as const

const SHARED_COMPONENTS = ["feedback-ticket-dialog.tsx", "feedback-thread.tsx"]
const PICKER_COMPONENT = "feedback-image-picker.tsx"

// Montadas em template string (t(`status_${s}`)), invisíveis para o regex.
const DYNAMIC_KEYS = [
  "status_NEW",
  "status_IN_REVIEW",
  "status_RESOLVED",
  "status_WONT_FIX",
  "status_REOPENED",
]

function messages(locale: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf-8"))
}

function usedKeys(files: string[]): string[] {
  const keys = new Set<string>()
  for (const file of files) {
    const src = readFileSync(join(process.cwd(), "src", "components", file), "utf-8")
    for (const m of src.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]!)
  }
  return [...keys]
}

describe("i18n dos componentes de feedback compartilhados", () => {
  const shared = [...usedKeys(SHARED_COMPONENTS), ...DYNAMIC_KEYS]
  const picker = usedKeys([PICKER_COMPONENT])

  it("encontra as chaves usadas no diálogo (guarda contra regex que parou de casar)", () => {
    expect(shared.length).toBeGreaterThan(20)
    expect(shared).toContain("typeLabel")
  })

  for (const locale of LOCALES) {
    for (const ns of SHARED_NAMESPACES) {
      it(`${locale}.${ns} tem todas as chaves do diálogo de ticket`, () => {
        const ms = messages(locale)[ns] ?? {}
        expect(shared.filter((k) => !(k in ms))).toEqual([])
      })
    }

    for (const ns of PICKER_NAMESPACES) {
      it(`${locale}.${ns} tem todas as chaves do seletor de imagens`, () => {
        const ms = messages(locale)[ns] ?? {}
        expect(picker.filter((k) => !(k in ms))).toEqual([])
      })
    }
  }
})
