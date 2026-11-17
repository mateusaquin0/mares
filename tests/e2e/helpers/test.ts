import { test as base, expect, type Browser, type Page } from "@playwright/test"

import { VIEWPORT } from "./app"
import { BASE_URL } from "./env"
import { storageStatePath, type RoleKey } from "./fixtures"

// `test` da suíte: o do Playwright, com as navegações tolerantes ao reinício do servidor.
//
// O `next dev` reinicia a si mesmo quando o uso de memória chega perto do limite ("Server is
// approaching the used memory threshold, restarting..."), e numa execução que compila quase
// todas as rotas do app isso acontece, em geral uma vez. O reinício leva poucos segundos, mas a
// navegação que estiver em curso naquele instante fica pendurada até estourar o prazo do teste.
// Aqui a navegação tem prazo próprio e, se ele estourar (ou a conexão cair), espera o servidor
// voltar a responder e tenta de novo, uma única vez. Nada disso encobre erro do app: uma página
// que responde com erro continua falhando do mesmo jeito.

const NAVIGATION_TIMEOUT = 45_000
const TRANSIENT = /Timeout|ERR_CONNECTION|ERR_EMPTY_RESPONSE|ERR_ABORTED|ERR_SOCKET/i

async function serverBack() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(20_000) })
      if (res.ok) return
    } catch {
      // ainda reiniciando
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
}

async function tolerant<T>(navigate: (timeout: number) => Promise<T>): Promise<T> {
  try {
    return await navigate(NAVIGATION_TIMEOUT)
  } catch (err) {
    if (!TRANSIENT.test(String(err))) throw err
    await serverBack()
    return navigate(NAVIGATION_TIMEOUT * 2)
  }
}

export function resilient(page: Page): Page {
  const goto = page.goto.bind(page)
  const reload = page.reload.bind(page)
  page.goto = (url, options) => tolerant((timeout) => goto(url, { timeout, ...options }))
  page.reload = (options) => tolerant((timeout) => reload({ timeout, ...options }))
  return page
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    await provide(resilient(page))
  },
})

export { expect }

// Página numa sessão salva de outro papel — para os fluxos em que duas pessoas se alternam.
export async function as(browser: Browser, role: RoleKey): Promise<Page> {
  const context = await browser.newContext({
    storageState: storageStatePath(role),
    viewport: VIEWPORT,
  })
  return resilient(await context.newPage())
}
