import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import en from "../../messages/en.json"
import { hydrated, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Idioma e tema, pelo menu do usuário. As duas preferências ficam no navegador (cookie e
// localStorage), então valem só para o contexto deste teste e não mexem na conta.

test.describe("Idioma e tema", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  async function userMenu(page: Page) {
    const menu = page.getByRole("button", { name: loadFixtures().users.workAdmin.email })
    await hydrated(menu)
    await menu.click()
  }

  test("troca para inglês, confere os textos em várias telas e volta para português", async ({
    page,
  }) => {
    await page.goto("/app/dashboard")
    await expect(page.locator("html")).toHaveAttribute("lang", "pt")
    await expect(page.getByRole("heading", { name: pt.dashboard.title, level: 1 })).toBeVisible()

    await userMenu(page)
    await page.getByRole("menuitem", { name: "English" }).click()

    // A tela atual é traduzida sem recarregar: título, menu lateral e atributo de idioma.
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await expect(page.getByRole("heading", { name: en.dashboard.title, level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: en.sidebar.animals, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: en.sidebar.catalogs, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: pt.sidebar.animals, exact: true })).toHaveCount(0)

    // Lista de animais.
    await page.goto("/app/animals")
    await expect(page.getByRole("heading", { name: en.animals.title, level: 1 })).toBeVisible()
    await expect(page.getByRole("button", { name: en.animals.new })).toBeVisible()
    await expect(page.getByPlaceholder(en.common.search, { exact: true })).toBeVisible()
    await expect(
      page.getByRole("button", { name: en.animals.colSpecies, exact: true }),
    ).toBeVisible()

    // Pesquisas.
    await page.goto("/app/research")
    await expect(page.getByRole("heading", { name: en.research.title, level: 1 })).toBeVisible()
    await expect(page.getByRole("button", { name: en.research.new })).toBeVisible()

    // Glossário: os rótulos do catálogo também mudam (nome em inglês do item semeado).
    await page.goto("/app/catalogs")
    await expect(page.getByRole("heading", { name: en.catalogs.title, level: 1 })).toBeVisible()
    await expect(page.getByRole("tab", { name: en.catalogs.tabPathogens })).toBeVisible()

    // Detalhe de um animal: abas e rótulos dos campos.
    const { work } = loadFixtures()
    await page.goto(`/app/animals/${work.clinical.necropsy.id}`)
    await expect(page.getByRole("tab", { name: en.animals.necropsyTab })).toBeVisible()
    await expect(page.getByRole("tab", { name: en.animals.auditTab })).toBeVisible()
    await expect(page.getByText(en.animals.municipality, { exact: true })).toBeVisible()
    await expect(page.getByText(en.animals.sexMale, { exact: true })).toBeVisible()

    // A escolha persiste (cookie): uma página pública aberta depois também vem em inglês.
    await page.goto("/login")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")

    // Volta para português.
    await page.goto("/app/dashboard")
    await userMenu(page)
    await page.getByRole("menuitem", { name: "Português" }).click()
    await expect(page.locator("html")).toHaveAttribute("lang", "pt")
    await expect(page.getByRole("heading", { name: pt.dashboard.title, level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: pt.sidebar.animals, exact: true })).toBeVisible()
  })

  test("alterna o tema entre claro e escuro, e a escolha persiste", async ({ page }) => {
    const html = page.locator("html")
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    await page.goto("/app/dashboard")
    await userMenu(page)
    await page.getByRole("menuitem", { name: pt.sidebar.themeLight }).click()
    await expect(html).toHaveClass(/\blight\b/)
    await expect(html).not.toHaveClass(/\bdark\b/)
    const light = await background()

    // O menu continua aberto ao escolher o tema.
    await page.getByRole("menuitem", { name: pt.sidebar.themeDark }).click()
    await expect(html).toHaveClass(/\bdark\b/)
    // A cor de fundo muda de fato, não só a classe.
    await expect.poll(background).not.toBe(light)

    await page.reload()
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)

    await userMenu(page)
    await page.getByRole("menuitem", { name: pt.sidebar.themeLight }).click()
    await expect(html).not.toHaveClass(/\bdark\b/)
    await expect.poll(background).toBe(light)
  })
})
