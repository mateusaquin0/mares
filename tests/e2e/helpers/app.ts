import { expect, type Locator, type Page } from "@playwright/test"

import pt from "../../../messages/pt.json"

// Textos da interface no locale padrão (pt). Os seletores usam as MESMAS mensagens que o app
// renderiza, em vez de cópias soltas nos testes.
export { pt }

// A área logada é substituída por um aviso abaixo de 1024×600 (min-width-gate.tsx), e a barra
// lateral recolhe abaixo de 1280px. A suíte roda sempre em janela de desktop.
export const VIEWPORT = { width: 1440, height: 900 }

export async function fillLogin(page: Page, email: string, password: string) {
  await page.goto("/login")
  await hydrated(page.getByRole("button", { name: pt.login.submit, exact: true }))
  await page.getByLabel(pt.common.email).fill(email)
  await page.getByLabel(pt.login.password, { exact: true }).fill(password)
  await page.getByRole("button", { name: pt.login.submit, exact: true }).click()
}

// Aviso flutuante (sonner) com o texto dado.
export function toast(page: Page, text: string): Locator {
  return page.locator("[data-sonner-toast]").filter({ hasText: text })
}

// Seletor pesquisável ainda vazio, localizado pelo texto que ele exibe. O papel `combobox` não
// recebe nome acessível do próprio conteúdo, então `getByRole(..., { name })` não o encontra.
export function combobox(scope: Page | Locator, placeholder: string): Locator {
  return scope.getByRole("combobox").filter({ hasText: placeholder })
}

// Escolhe uma opção num seletor pesquisável (Combobox/MultiCombobox: botão + lista com busca).
export async function pickFromCombobox(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByPlaceholder(pt.common.search, { exact: true }).fill(option)
  await page.getByRole("option", { name: option, exact: true }).click()
}

// Escolhe uma opção num Select simples (Radix): o gatilho abre uma lista de opções.
export async function pickFromSelect(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

// Espera o React assumir o elemento antes de interagir. A página chega renderizada do
// servidor e só responde a cliques depois da hidratação; num `next dev`, que compila sob
// demanda, esse intervalo é longo o bastante para um clique imediato se perder em silêncio.
export async function hydrated(target: Locator) {
  await expect
    .poll(() => target.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$"))))
    .toBe(true)
}

// Aviso flutuante mais recente com o texto dado: várias ações seguidas repetem a mesma
// mensagem ("Achado registrado"), e os avisos anteriores ainda estão na tela.
//
// O prazo é maior que o padrão: o aviso só sai depois da resposta do servidor, e num `next dev`
// a primeira chamada de cada rota inclui a compilação dela.
export async function expectToast(page: Page, text: string) {
  await expect(toast(page, text).last()).toBeVisible({ timeout: 60_000 })
}

// Abre o detalhe de um animal já numa das abas (Necrópsia, Biometria, Amostras…).
export async function openAnimalTab(page: Page, animalId: string, tab: string) {
  await page.goto(`/app/animals/${animalId}`)
  const trigger = page.getByRole("tab", { name: tab })
  await hydrated(trigger)
  await trigger.click()
}

// Diálogo de confirmação (ConfirmDialog): confirma pela ação de rótulo dado.
export async function confirmAlert(page: Page, title: string, action: string) {
  const dialog = page.getByRole("alertdialog", { name: title })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: action, exact: true }).click()
}

// Menu "⋯" de uma linha de tabela: abre e escolhe o item.
export async function rowMenu(page: Page, row: Locator, item: string, trigger = pt.common.actions) {
  await row.getByRole("button", { name: trigger, exact: true }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

// PNG 1×1 válido (o servidor confere os "magic bytes" do conteúdo, não só o tipo declarado).
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)
